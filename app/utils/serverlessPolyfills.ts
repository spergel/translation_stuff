// Serverless environment polyfills and setup

// Polyfill for Promise.withResolvers (needed for PDF.js compatibility in server environment)
export function setupPromisePolyfills() {
  if (typeof Promise.withResolvers !== 'function') {
    (Promise as any).withResolvers = function <T>() {
      let resolve!: (value: T | PromiseLike<T>) => void
      let reject!: (reason?: any) => void
      const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    }
  }
}

// Simple Path2D polyfill for basic operations
class Path2DPolyfill {
  private commands: any[] = []
  
  constructor(path?: string | Path2DPolyfill) {
    if (typeof path === 'string') {
      // Parse SVG path string if needed
      this.commands = []
    } else if (path instanceof Path2DPolyfill) {
      this.commands = [...path.commands]
    }
  }
  
  moveTo(x: number, y: number) {
    this.commands.push(['moveTo', x, y])
  }
  
  lineTo(x: number, y: number) {
    this.commands.push(['lineTo', x, y])
  }
  
  closePath() {
    this.commands.push(['closePath'])
  }
  
  rect(x: number, y: number, w: number, h: number) {
    this.commands.push(['rect', x, y, w, h])
  }
  
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean) {
    this.commands.push(['arc', x, y, radius, startAngle, endAngle, anticlockwise])
  }
  
  // Add other methods as needed by pdfjs-serverless
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
    this.commands.push(['bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y])
  }
  
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
    this.commands.push(['quadraticCurveTo', cpx, cpy, x, y])
  }
}

// Polyfill for Path2D (needed for pdfjs-serverless in serverless environment)
export function setupPath2DPolyfill() {
  if (typeof global !== 'undefined' && typeof (global as any).Path2D === 'undefined') {
    console.log('🔧 Adding Path2D polyfill for serverless environment...')
    ;(global as any).Path2D = Path2DPolyfill
    console.log('✅ Path2D polyfill added successfully')
  }
}

// Initialize all polyfills
export function initializeServerlessEnvironment() {
  setupPromisePolyfills()
  setupPath2DPolyfill()
  console.log(`🔧 Using pdfjs-serverless - no worker configuration needed`)
} 