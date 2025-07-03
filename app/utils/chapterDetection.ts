import { TranslationResult, ChapterInfo } from '../types/translation';

// Simple heuristics to pre-filter potential chapter pages
function hasChapterHeuristics(text: string): boolean {
  const chapterPatterns = [
    /chapter\s+\d+/i,
    /^chapter/i,
    /^part\s+\d+/i,
    /^section\s+\d+/i,
    /^book\s+\d+/i,
    /^\d+\.\s/,
    /^[IVX]+\.\s/, // Roman numerals
    /appendix/i,
    /introduction/i,
    /conclusion/i,
    /preface/i,
    /acknowledgments/i,
    /bibliography/i,
    /index$/i
  ];
  
  return chapterPatterns.some(pattern => pattern.test(text.trim()));
}

// Extract potential chapter heading from text
function extractPotentialHeading(text: string): string | null {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Look for the first line that might be a heading
  for (const line of lines.slice(0, 5)) { // Check first 5 non-empty lines
    if (hasChapterHeuristics(line)) {
      return line;
    }
    
    // Check if line is short and potentially a heading (under 100 chars)
    if (line.length < 100 && line.length > 3) {
      // Check if it's not a sentence (no period at end, or starts with capital)
      if (!line.endsWith('.') || /^[A-Z]/.test(line)) {
        return line;
      }
    }
  }
  
  return null;
}

// Use Gemini to detect chapters in a batch of pages
export async function detectChaptersWithAI(
  results: TranslationResult[], 
  targetLanguage: string = 'english'
): Promise<TranslationResult[]> {
  console.log('🔍 Starting AI chapter detection for', results.length, 'pages');
  
  // Pre-filter pages that might contain chapters using heuristics
  const candidatePages = results.filter(result => {
    const heading = extractPotentialHeading(result.translation);
    return heading !== null;
  });
  
  console.log('📋 Found', candidatePages.length, 'candidate pages with potential chapters');
  
  if (candidatePages.length === 0) {
    console.log('ℹ️ No candidate pages found, returning original results');
    return results;
  }
  
  // Create context for AI analysis - include some surrounding pages for context
  const analysisPages = candidatePages.map(candidate => {
    const pageIndex = results.findIndex(r => r.page_number === candidate.page_number);
    const prevPage = pageIndex > 0 ? results[pageIndex - 1] : null;
    const nextPage = pageIndex < results.length - 1 ? results[pageIndex + 1] : null;
    
    return {
      page_number: candidate.page_number,
      text: candidate.translation,
      previous_page_text: prevPage?.translation?.substring(0, 200) || '',
      next_page_text: nextPage?.translation?.substring(0, 200) || '',
      potential_heading: extractPotentialHeading(candidate.translation)
    };
  });
  
  // Call Gemini to analyze chapters
  try {
    const chapterAnalysis = await analyzeChaptersWithGemini(analysisPages, targetLanguage);
    
    // Apply the chapter information back to the results
    const updatedResults = results.map(result => {
      const chapterInfo = chapterAnalysis.find(ch => ch.page_number === result.page_number);
      if (chapterInfo && chapterInfo.confidence > 0.6) { // Only accept high-confidence chapters
        return {
          ...result,
          isChapterStart: true,
          chapterInfo
        };
      }
      return result;
    });
    
    const detectedChapters = updatedResults.filter(r => r.isChapterStart);
    console.log('✅ Chapter detection complete:', detectedChapters.length, 'chapters detected');
    
    return updatedResults;
    
  } catch (error) {
    console.error('❌ Error in AI chapter detection:', error);
    // Return original results if AI fails
    return results;
  }
}

// Call Gemini to analyze potential chapters
async function analyzeChaptersWithGemini(
  analysisPages: any[], 
  targetLanguage: string
): Promise<ChapterInfo[]> {
  const prompt = `You are analyzing a document to identify chapter headings. For each page provided, determine if it contains a chapter heading.

Target language: ${targetLanguage}

For each page, respond with a JSON object containing:
- page_number: number
- title: string (the actual chapter title, cleaned up)
- position: "top" | "middle" | "bottom" (where on the page the heading appears)
- confidence: number (0-1, how confident you are this is a chapter heading)

Only include pages with confidence > 0.6. Look for:
- Chapter numbers (Chapter 1, Chapter 2, etc.)
- Section headings
- Part divisions
- Appendices
- Table of contents entries
- Introduction/Conclusion sections

Pages to analyze:
${analysisPages.map(page => `
Page ${page.page_number}:
Previous page context: "${page.previous_page_text}"
Current page: "${page.text.substring(0, 500)}"
Next page context: "${page.next_page_text}"
Potential heading: "${page.potential_heading}"
`).join('\n')}

Respond with a JSON array of chapter objects. If no chapters are found, return an empty array.`;

  try {
    // Use the cheapest Gemini model for this task
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.1, // Low temperature for consistent results
          maxOutputTokens: 2048,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      throw new Error('No response from Gemini');
    }

    // Parse the JSON response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log('⚠️ No JSON array found in Gemini response, trying to parse full response');
      return JSON.parse(text);
    }
    
    const chapters = JSON.parse(jsonMatch[0]);
    console.log('🤖 Gemini identified', chapters.length, 'chapters');
    
    return chapters;
    
  } catch (error) {
    console.error('❌ Error calling Gemini API:', error);
    throw error;
  }
} 