// Serverless environment polyfills and setup for the worker
// Polyfill for Promise.withResolvers (needed for PDF.js compatibility in server environment)
export function setupPromisePolyfills() {
    if (typeof Promise.withResolvers !== 'function') {
        Promise.withResolvers = function () {
            let resolve;
            let reject;
            const promise = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });
            return { promise, resolve, reject };
        };
        console.log('🔧 Worker: Promise.withResolvers polyfill applied.');
    }
}
// Simple Path2D polyfill for basic operations
class Path2DPolyfill {
    constructor(path) {
        this.commands = [];
        if (typeof path === 'string') {
            // Parse SVG path string if needed
            this.commands = [];
        }
        else if (path instanceof Path2DPolyfill) {
            this.commands = [...path.commands];
        }
    }
    moveTo(x, y) {
        this.commands.push(['moveTo', x, y]);
    }
    lineTo(x, y) {
        this.commands.push(['lineTo', x, y]);
    }
    closePath() {
        this.commands.push(['closePath']);
    }
    rect(x, y, w, h) {
        this.commands.push(['rect', x, y, w, h]);
    }
    arc(x, y, radius, startAngle, endAngle, anticlockwise) {
        this.commands.push(['arc', x, y, radius, startAngle, endAngle, anticlockwise]);
    }
    // Add other methods as needed by pdfjs-serverless
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
        this.commands.push(['bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y]);
    }
    quadraticCurveTo(cpx, cpy, x, y) {
        this.commands.push(['quadraticCurveTo', cpx, cpy, x, y]);
    }
}
// Polyfill for Path2D (needed for pdfjs-serverless in serverless environment)
export function setupPath2DPolyfill() {
    if (typeof global !== 'undefined' && typeof global.Path2D === 'undefined') {
        console.log('🔧 Worker: Adding Path2D polyfill for serverless environment...');
        global.Path2D = Path2DPolyfill;
        console.log('✅ Worker: Path2D polyfill added successfully');
    }
}
// Initialize all polyfills for the worker environment
export function initializeWorkerEnvironment() {
    console.log('🚀 Initializing worker environment polyfills...');
    setupPromisePolyfills();
    setupPath2DPolyfill();
    // Note: Full canvas (node-canvas) setup will be handled by importing it where needed.
    // pdfjs-serverless might still need global.CanvasRenderingContext2D or similar.
    console.log('✅ Worker: Environment polyfills initialized.');
}
