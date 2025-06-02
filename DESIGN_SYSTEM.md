# PDF Translator Design System

## 🎨 **Design Philosophy**
A warm, scholarly aesthetic that feels like working with paper documents. Clean, readable typography with subtle shadows and organic color palettes that evoke the feeling of translating ancient texts or academic papers.

---

## 🌈 **Color Palette**

### **Primary Colors (Warm Browns/Tans)**
```css
--color-primary-50: #f8f5f0    /* Very light warm beige - main background */
--color-primary-100: #8D6E63   /* Medium warm brown - accents */
--color-primary-200: #6D4C41   /* Darker brown - borders */
--color-primary-300: #5D4037   /* Main dark brown - headings, important text */
--color-primary-400: #4E342E   /* Darkest brown - high emphasis */
```

### **Content Background Colors**
```css
--color-white: #ffffff         /* Pure white - content cards */
--color-content-bg: #f9f9f9    /* Light gray - content areas */
--color-original-bg: #fff8e1   /* Warm yellow tint - original text */
--color-translation-bg: #f0f8ff /* Cool blue tint - translations */
```

### **Semantic Colors**
```css
--color-success: #4CAF50       /* Green - completed states */
--color-warning: #FF9800       /* Orange - processing states */
--color-error: #f44336         /* Red - error states */
--color-info: #2196F3          /* Blue - information */
```

### **Neutral Grays**
```css
--color-gray-50: #fafafa
--color-gray-100: #f5f5f5
--color-gray-200: #eeeeee
--color-gray-300: #e0e0e0
--color-gray-400: #bdbdbd
--color-gray-500: #9e9e9e
--color-gray-600: #757575
--color-gray-700: #616161
--color-gray-800: #424242
--color-gray-900: #212121
```

---

## 📝 **Typography**

### **Font Families**
```css
--font-primary: 'Bookerly', 'Georgia', serif    /* Main reading font */
--font-secondary: 'Inter', system-ui, sans-serif /* UI elements */
--font-mono: 'Courier New', monospace           /* Code/transcription */
```

### **Font Sizes & Hierarchy**
```css
--text-xs: 0.75rem      /* 12px - small labels */
--text-sm: 0.875rem     /* 14px - secondary text */
--text-base: 1rem       /* 16px - body text */
--text-lg: 1.125rem     /* 18px - large body */
--text-xl: 1.25rem      /* 20px - section headers */
--text-2xl: 1.5rem      /* 24px - page titles */
--text-3xl: 1.875rem    /* 30px - main headings */
--text-4xl: 2.25rem     /* 36px - hero headings */
```

### **Line Heights**
```css
--leading-tight: 1.25
--leading-normal: 1.5
--leading-relaxed: 1.625
--leading-loose: 1.8     /* For reading content */
```

---

## 🏗️ **Layout & Spacing**

### **Spacing Scale**
```css
--space-1: 0.25rem   /* 4px */
--space-2: 0.5rem    /* 8px */
--space-3: 0.75rem   /* 12px */
--space-4: 1rem      /* 16px */
--space-5: 1.25rem   /* 20px */
--space-6: 1.5rem    /* 24px */
--space-8: 2rem      /* 32px */
--space-10: 2.5rem   /* 40px */
--space-12: 3rem     /* 48px */
--space-16: 4rem     /* 64px */
```

### **Container Widths**
```css
--width-content: 800px    /* Reading content */
--width-wide: 1400px      /* Side-by-side layouts */
--width-full: 1600px      /* Full comparison views */
```

---

## 🎭 **Component Styles**

### **Cards & Containers**
```css
.card {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 30px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.content-section {
  background: #f9f9f9;
  border-left: 4px solid var(--color-primary-100);
  padding: 15px;
  border-radius: 4px;
}
```

### **Buttons**
```css
.btn-primary {
  background: var(--color-primary-300);
  color: white;
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.btn-primary:hover {
  background: var(--color-primary-400);
  box-shadow: 0 4px 8px rgba(0,0,0,0.15);
}
```

### **Form Elements**
```css
.form-input {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 12px 16px;
  font-size: 16px;
  transition: border-color 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary-300);
  box-shadow: 0 0 0 3px rgba(93, 64, 55, 0.1);
}
```

---

## 🌟 **Special Design Elements**

### **Page Sections**
```css
.page-section {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
  margin-bottom: 30px;
}

.section-header {
  color: var(--color-primary-300);
  border-bottom: 2px solid var(--color-primary-100);
  padding-bottom: 10px;
  margin-bottom: 20px;
  font-weight: bold;
}
```

### **Content Comparison Layouts**
```css
.comparison-layout {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.original-content {
  flex: 1;
  background: #fff8e1;
  border-left: 4px solid #FF9800;
  padding: 15px;
  border-radius: 4px;
}

.translated-content {
  flex: 1;
  background: #f0f8ff;
  border-left: 4px solid #4CAF50;
  padding: 15px;
  border-radius: 4px;
}
```

### **Status Indicators**
```css
.status-completed { background: #e8f5e8; color: #2e7d32; }
.status-processing { background: #fff3e0; color: #f57c00; }
.status-error { background: #ffebee; color: #c62828; }
.status-queued { background: #f3e5f5; color: #7b1fa2; }
```

---

## 🎯 **Usage Guidelines**

### **Do's**
- ✅ Use warm beige backgrounds for main page areas
- ✅ Employ serif fonts for reading content
- ✅ Add subtle shadows to create depth
- ✅ Use color-coded borders for different content types
- ✅ Maintain generous spacing for readability
- ✅ Use rounded corners (4-8px) for modern feel

### **Don'ts**
- ❌ Don't use pure black (#000000) - use dark brown instead
- ❌ Don't use harsh bright colors - keep it warm and muted
- ❌ Don't crowd content - maintain breathing room
- ❌ Don't mix too many fonts - stick to the system

---

## 📱 **Responsive Considerations**

### **Mobile Adjustments**
- Reduce padding on mobile devices
- Stack comparison layouts vertically
- Increase touch target sizes to 44px minimum
- Simplify complex layouts for small screens

### **Breakpoints**
```css
--breakpoint-sm: 640px
--breakpoint-md: 768px
--breakpoint-lg: 1024px
--breakpoint-xl: 1280px
```

---

This design system creates a cohesive, scholarly aesthetic that makes users feel like they're working with important documents in a comfortable, academic environment. 