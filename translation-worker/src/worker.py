import os
import json
import base64
import tempfile
import logging
from io import BytesIO
from typing import Dict, List, Optional
import requests
from PIL import Image
import PyPDF2
import redis
from rq import Worker, Queue, Connection
from dotenv import load_dotenv
import google.generativeai as genai
from pdf2image import convert_from_path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Configure Redis connection
redis_conn = redis.Redis.from_url(
    os.getenv('REDIS_CONNECTION_STRING', ''),
    ssl_cert_reqs=None,
    decode_responses=True
)

# Configure Gemini API
genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))

def extract_text_from_pdf(pdf_path: str) -> List[str]:
    """Extract text from each page of a PDF file."""
    page_texts = []
    try:
        with open(pdf_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            for page in reader.pages:
                text = page.extract_text()
                if text:
                    text = ' '.join(text.split())
                page_texts.append(text)
        logger.info(f"Successfully extracted text from {len(page_texts)} pages")
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {str(e)}")
        raise
    return page_texts

def render_page_to_image(pdf_path: str, page_number: int) -> str:
    """Render a PDF page to a PNG image and return as base64."""
    try:
        # Convert PDF page to image using pdf2image
        images = convert_from_path(
            pdf_path,
            first_page=page_number,
            last_page=page_number,
            dpi=200
        )
        
        if not images:
            raise ValueError(f"No image generated for page {page_number}")
            
        # Get the first (and only) image
        img = images[0]
        
        # Resize if too large
        max_size = 1500
        if max(img.size) > max_size:
            ratio = max_size / max(img.size)
            new_size = tuple(int(dim * ratio) for dim in img.size)
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        # Convert to base64
        buffered = BytesIO()
        img.save(buffered, format="PNG", optimize=True, quality=85)
        img_str = base64.b64encode(buffered.getvalue()).decode()
        
        logger.info(f"Successfully rendered page {page_number} to image")
        return f"data:image/png;base64,{img_str}"
    except Exception as e:
        logger.error(f"Error rendering page to image: {str(e)}")
        raise

def translate_text(text: str, target_lang: str, model_name: str) -> str:
    """Translate text using Gemini API."""
    try:
        if not text.strip():
            return "[No text to translate]"
            
        model = genai.GenerativeModel(model_name)
        prompt = f"Translate the following text to {target_lang}. Preserve any formatting, numbers, and special characters: {text}"
        
        response = model.generate_content(
            prompt,
            generation_config={
                'temperature': 0.1,
                'top_p': 0.8,
                'top_k': 40
            }
        )
        
        if not response.text:
            raise ValueError("Empty translation response")
            
        logger.info(f"Successfully translated text using {model_name}")
        return response.text
    except Exception as e:
        logger.error(f"Error translating text: {str(e)}")
        raise

def process_pdf_translation(job_data: Dict) -> List[Dict]:
    """Process a PDF translation job."""
    try:
        # Extract job data
        file_name = job_data['file']['name']
        blob_url = job_data['blobUrl']
        target_language = job_data['targetLanguage']
        user_tier = job_data.get('userTier', 'free')
        job_id = job_data.get('jobId')
        
        # Determine model based on user tier
        model_name = 'gemini-2.0-flash' if user_tier == 'pro' else 'gemini-1.5-flash-8b'
        
        logger.info(f"Starting job {job_id} for file {file_name}")
        
        # Create temp directory for PDF
        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path = os.path.join(temp_dir, file_name)
            
            # Download PDF
            logger.info(f"Downloading from {blob_url} to {pdf_path}")
            response = requests.get(blob_url)
            response.raise_for_status()
            
            with open(pdf_path, 'wb') as f:
                f.write(response.content)
            logger.info(f"Downloaded to {pdf_path}")
            
            # Extract text from all pages
            logger.info("Extracting text from PDF")
            page_texts = extract_text_from_pdf(pdf_path)
            total_pages = len(page_texts)
            
            results = []
            for i, text in enumerate(page_texts, 1):
                logger.info(f"Processing page {i}/{total_pages}")
                
                try:
                    # Render page to image
                    page_image = render_page_to_image(pdf_path, i)
                    
                    # Translate text
                    translated_text = translate_text(text, target_language, model_name)
                    
                    result = {
                        'page_number': i,
                        'original_text': text,
                        'translated_text': translated_text,
                        'page_image': page_image,
                        'notes': f"Model: {model_name}. Mode: {'Image-Only' if not text.strip() else 'Text+Image'}."
                    }
                    results.append(result)
                    
                    # Update job progress
                    progress = int((i / total_pages) * 100)
                    job = Queue('translation-jobs').fetch_job(job_id)
                    if job:
                        job.meta['progress'] = progress
                        job.save_meta()
                        
                except Exception as e:
                    logger.error(f"Error processing page {i}: {str(e)}")
                    # Add error result but continue processing
                    results.append({
                        'page_number': i,
                        'original_text': text,
                        'translated_text': f"[Error: {str(e)}]",
                        'page_image': None,
                        'notes': f"Error processing page: {str(e)}"
                    })
            
            logger.info(f"Completed job {job_id} with {len(results)} pages")
            return results
            
    except Exception as e:
        logger.error(f"Job {job_id} failed: {str(e)}")
        raise

if __name__ == '__main__':
    logger.info("✨ PDF Translation Worker started successfully ✨")
    
    try:
        with Connection(redis_conn):
            worker = Worker(['translation-jobs'])
            worker.work()
    except Exception as e:
        logger.error(f"Worker failed: {str(e)}")
        raise 