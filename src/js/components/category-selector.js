export class CategorySelector {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - The wrapper element (.category-selector)
   * @param {HTMLInputElement} options.input - The hidden input to store the value
   * @param {Array} options.data - Array of category objects
   * @param {Function} [options.onSelect] - Callback when a leaf category is selected
   */
  constructor(options) {
    this.container = options.container;
    this.input = options.input;
    this.data = options.data || [];
    this.onSelect = options.onSelect || (() => {});

    this.trigger = this.container.querySelector(".category-trigger");
    this.dropdown = this.container.querySelector(".category-dropdown");
    this.selectedText = this.container.querySelector("[data-selected-category]");
    
    this.stack = []; // Navigation stack: [parentCategory, childCategory...]
    
    this.init();
  }

  init() {
    // Create backdrop
    this.backdrop = document.createElement("div");
    this.backdrop.className = "category-backdrop";
    document.body.appendChild(this.backdrop);
    
    this.backdrop.addEventListener("click", () => this.close());

    if (this.trigger) {
      this.trigger.addEventListener("click", (e) => {
        e.preventDefault();
        this.toggle();
      });
    }

    // Close on click outside (handled by backdrop now, but keep for safety)
    /* document.addEventListener("click", (e) => {
      if (!this.container.contains(e.target) && !this.dropdown.contains(e.target)) {
        // this.close(); // Backdrop handles this
      }
    }); */

    // Initial render
    this.render();
  }

  setData(data) {
    this.data = data;
    this.stack = []; 
    this.render();
  }

  toggle() {
    const isOpen = !this.dropdown.hidden;
    if (isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.dropdown.hidden = false;
    this.trigger.classList.add("is-open");
    this.backdrop.classList.add("is-visible");
    // Always start at root when opening to avoid confusion
    this.stack = [];
    this.render();
  }

  close() {
    this.dropdown.hidden = true;
    this.trigger.classList.remove("is-open");
    this.backdrop.classList.remove("is-visible");
  }

  render() {
    if (!this.dropdown) return;
    this.dropdown.innerHTML = "";

    // Determine current level items
    let currentItems = this.data;
    let parentName = null;

    if (this.stack.length > 0) {
      const lastParent = this.stack[this.stack.length - 1];
      currentItems = lastParent.children || [];
      parentName = lastParent.name;
    }

    // 1. Header (Back Button) if deep
    if (this.stack.length > 0) {
      const header = document.createElement("div");
      header.className = "category-header";
      header.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
        <span>${parentName}</span>
      `;
      header.onclick = (e) => {
        e.stopPropagation();
        this.stack.pop();
        this.render();
      };
      this.dropdown.appendChild(header);
    }

    // 2. List Container
    const list = document.createElement("div");
    list.className = "category-list";

    if (currentItems.length === 0) {
      const empty = document.createElement("div");
      empty.className = "category-option";
      empty.style.color = "var(--muted)";
      empty.style.justifyContent = "center";
      empty.textContent = "Нет подкатегорий";
      list.appendChild(empty);
    } else {
      currentItems.forEach(item => {
        const row = document.createElement("div");
        row.className = "category-option";
        
        const hasChildren = item.children && item.children.length > 0;
        if (hasChildren) {
          row.classList.add("has-children");
        }

        // Check if selected (only matches leaf selection usually)
        if (this.input && String(this.input.value) === String(item.id)) {
          row.classList.add("is-selected");
        }

        row.textContent = item.name;

        row.onclick = (e) => {
          e.stopPropagation();
          if (hasChildren) {
            // Navigate deeper
            this.stack.push(item);
            this.render();
          } else {
            // Select and close
            this.selectCategory(item);
          }
        };
        list.appendChild(row);
      });
    }

    this.dropdown.appendChild(list);
  }

  selectCategory(item) {
    if (this.input) {
      this.input.value = item.id;
      this.input.dispatchEvent(new Event('change', { bubbles: true }));
      this.input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    if (this.selectedText) {
      // Show full path if possible, or just name
      // Construct path from stack + current item
      const pathNames = this.stack.map(s => s.name).concat([item.name]);
      // If path is too long, maybe just show last 2? 
      // For now, let's try full path joined by " / "
      this.selectedText.textContent = pathNames.join(" / ");
    }

    this.close();
    this.onSelect(item);
  }

  setValue(id) {
    if (!id) return;
    
    // Helper to find item and build stack path
    const findPath = (items, targetId, currentPath = []) => {
      for (const item of items) {
        if (String(item.id) === String(targetId)) {
          return { item, path: currentPath };
        }
        if (item.children) {
          const result = findPath(item.children, targetId, [...currentPath, item]);
          if (result) return result;
        }
      }
      return null;
    };

    const result = findPath(this.data, id);
    if (result) {
      const { item, path } = result;
      if (this.input) this.input.value = item.id;
      if (this.selectedText) {
        const pathNames = path.map(p => p.name).concat([item.name]);
        this.selectedText.textContent = pathNames.join(" / ");
      }
    }
  }
}
