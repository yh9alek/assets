// ─── SVG Icons ───────────────────────────────────────────────────────────────

const ICON_CHEVRON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="select-chevron" width="16" height="16" aria-hidden="true">
  <path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/>
</svg>`;

const ICON_SEARCH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
  <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd"/>
</svg>`;

const ICON_SPINNER = `<span class="loading loading-spinner loading-md text-primary" aria-label="Cargando…"></span>`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extrae un valor anidado de un objeto usando una ruta tipo "a.b.c" */
function extractByPath(obj, path) {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

// ─── Select ──────────────────────────────────────────────────────────────────

export class Select {
    /** @type {Select[]} */
    static instances = [];

    /**
     * @param {string | HTMLElement} container
     * @param {object} config
     * @param {string}   [config.placeholder]
     * @param {any[]}    [config.items]
     * @param {string}   [config.url]
     * @param {string}   [config.dataPath]             — Ruta dentro de la respuesta JSON hasta el array
     * @param {string}   [config.labelKey]             — Clave del label en cada objeto (default "label")
     * @param {string}   [config.valueKey]             — Clave del value en cada objeto (default "value")
     * @param {boolean}  [config.searchable]           — Muestra campo de búsqueda (default true)
     * @param {number}   [config.batchSize]            — Elementos por lote en renderizado progresivo
     * @param {boolean}  [config.addPlaceholderOption] — Añade opción vacía al inicio (default true)
     * @param {string}   [config.name]                 — name/id del <select> nativo
     * @param {boolean}  [config.serverSide]           — Búsqueda delegada al servidor
     * @param {number}   [config.limit]                — Límite de resultados en modo serverSide
     * @param {Function} [config.onChange]             — Callback (selectedItem | null, instance) => void
     * @param {Function} [config.fetchFn]              — Función async (url) => any (reemplaza fetch interno)
     */
    constructor(container, config = {}) {
        const el =
            typeof container === 'string'
                ? document.querySelector(container)
                : container;

        if (!el) throw new Error(`Select: contenedor "${container}" no encontrado.`);

        this._container  = el;
        this._config     = config;

        // Opciones
        this._placeholder          = config.placeholder ?? '-- Selecciona --';
        this._addPlaceholderOption = config.addPlaceholderOption !== false;
        this._searchable           = config.searchable !== false;
        this._batchSize            = config.batchSize ?? 8;
        this._serverSide           = !!config.serverSide;
        this._limit                = config.limit ?? 15;
        this._onChange             = config.onChange ?? null;
        this._fetchFn              = config.fetchFn ?? null;

        // Estado
        /** @type {{label: string, value: string, original: any}[]} */
        this._items            = [];
        this._filteredData     = [];
        this._loadedCount      = 0;
        this._selected         = null;
        this._highlightedIndex = -1;
        this._isSyncing        = false;
        this._showingMessage   = false;
        this._isLoading        = false;
        this._currentPage      = 1;
        this._lastPage         = 1;
        this._boundReposition  = null;

        // Caché server-side: evita repetir peticiones con los mismos parámetros
        /** @type {Map<string, {items: any[], lastPage: number}>} */
        this._fetchCache      = new Map();
        this._lastFetchKey    = null;

        // Form reset
        this._parentForm = this._container.closest('form');
        this._boundReset = this.reset.bind(this);
        if (this._parentForm) {
            this._parentForm.addEventListener('reset', this._boundReset);
        }

        this._render();
        this._bindEvents();
        this._proxyNativeValue();

        // Mover required al nativo
        if (config.required) {
            this._nativeSelect.required = true;
        }

        // Datos iniciales
        if (config.url) {
            this.fetchItems(config.url);
        } else if (Array.isArray(config.items)) {
            this.setItems(config.items);
        } else {
            this._showMessage('Sin datos.');
        }

        Select.instances.push(this);
        this._container._selectInstance = this;
    }

    // ── Renderizado ──────────────────────────────────────────────────────────

    _render() {
        this._container.innerHTML = '';
        this._container.classList.add('select-wrapper');

         this._container.setAttribute('data-select-wrapper', '');

        // El trigger y el select nativo quedan dentro del container
        this._container.innerHTML = `
            <select class="hidden" aria-hidden="true"></select>

            <button type="button" class="select-trigger" tabindex="0">
                <span class="select-label">${this._escHtml(this._placeholder)}</span>
                ${ICON_CHEVRON}
            </button>
        `;

        // El dropdown se construye por separado y se inserta en <body>
        // para escapar cualquier overflow:hidden/auto del modal o ancestro.
        const temp = document.createElement('div');
        temp.innerHTML = `
            <div class="select-dropdown" role="listbox" aria-label="Opciones">
                ${this._searchable ? `
                <div class="select-search">
                    ${ICON_SEARCH}
                    <input
                        type="text"
                        class="select-search-input"
                        placeholder="Buscar…"
                        autocomplete="off"
                        aria-label="Buscar opciones"
                    >
                    <button type="button" class="select-search-clear" aria-label="Limpiar búsqueda" hidden>
                        <span class="material-symbols-rounded" style="font-size:20px; color: rgb(223, 111, 88);">close</span>
                    </button>
                </div>` : ''}
                <div class="select-options" tabindex="-1"></div>
            </div>
        `;
        this._dropdown = temp.firstElementChild;
        // El dropdown se inserta en el portal correcto al abrir (_open),
        // no aquí, porque el <dialog> podría no estar abierto aún.
        document.body.appendChild(this._dropdown);

        this._nativeSelect = this._container.querySelector('select');
        this._trigger      = this._container.querySelector('.select-trigger');
        this._searchInp    = this._dropdown.querySelector('.select-search-input');
        this._searchClear  = this._dropdown.querySelector('.select-search-clear');
        this._optionsBox   = this._dropdown.querySelector('.select-options');

        if (this._config.name) {
            this._nativeSelect.name = this._config.name;
            this._nativeSelect.id   = this._config.name;
        }

        this._nativeSelect.setAttribute('data-native-select', '');
    }

    // ── Eventos ──────────────────────────────────────────────────────────────

    _bindEvents() {
        // Abrir / cerrar
        this._trigger.addEventListener('click', () => {
            const opening = !this._isOpen();
            this._toggle(opening);

            if (opening) {
                this._optionsBox.scrollTop = 0;
                if (this._searchInp) {
                    this._searchInp.value = '';
                    this._searchInp.focus();
                }
                if (this._searchClear) this._searchClear.hidden = true;
                if (this._serverSide) {
                    this._currentPage = 1;
                    this.fetchItems(this._config.url);
                }
            }
        });

        // Cerrar al hacer clic fuera.
        // El dropdown vive en <body>, por eso se verifica por separado.
        document.addEventListener('click', (e) => {
            const outsideContainer = !this._container.contains(e.target);
            const outsideDropdown  = !this._dropdown.contains(e.target);
            if (outsideContainer && outsideDropdown && this._isOpen()) {
                this._close();
                this._resetViewState();
            }
        });

        // Búsqueda
        if (this._searchable && this._searchInp) {
            // El placeholder (value === '') siempre se mantiene fijo al filtrar.
            const getFiltered = (term) => {
                const placeholder = this._addPlaceholderOption
                    ? this._items.filter(i => i.value === '')
                    : [];
                const results = term === ''
                    ? this._items.filter(i => i.value !== '')
                    : this._items.filter(i => i.value !== '' && i.label.toLowerCase().includes(term));
                return [...placeholder, ...results];
            };

            const updateClear = () => {
                if (this._searchClear) {
                    this._searchClear.hidden = this._searchInp.value === '';
                }
            };

            const onSearch = this._serverSide
                ? debounce(() => {
                    this._currentPage = 1;
                    updateClear();
                    this.fetchItems(this._config.url);
                }, 400)
                : () => {
                    const term = this._searchInp.value.trim().toLowerCase();
                    updateClear();
                    this._renderOptions(getFiltered(term));
                };

            this._searchInp.addEventListener('input', onSearch);

            // Botón limpiar
            if (this._searchClear) {
                this._searchClear.addEventListener('click', () => {
                    this._searchInp.value = '';
                    this._searchInp.focus();
                    updateClear();
                    if (this._serverSide) {
                        this._currentPage = 1;
                        this.fetchItems(this._config.url);
                    } else {
                        this._renderOptions(getFiltered(''));
                    }
                });
            }
        }

        // Scroll infinito
        this._optionsBox.addEventListener('scroll', () => {
            const { scrollTop, clientHeight, scrollHeight } = this._optionsBox;
            if (scrollTop + clientHeight >= scrollHeight - 20 && !this._isLoading) {
                if (this._serverSide) {
                    if (this._currentPage < this._lastPage) {
                        this._currentPage++;
                        this.fetchItems(this._config.url, true);
                    }
                } else {
                    if (this._loadedCount < this._filteredData.length) {
                        this._appendBatch();
                    }
                }
            }
        });

        // Teclado
        this._trigger.addEventListener('keydown', (e) => this._handleKeydown(e));
    }

    _handleKeydown(e) {
        const options = [...this._optionsBox.querySelectorAll('[data-value]')];

        if (!this._isOpen() && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
            e.preventDefault();
            this._open();
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this._highlightedIndex = Math.min(this._highlightedIndex + 1, options.length - 1);
                this._highlightOption(options);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this._highlightedIndex = Math.max(this._highlightedIndex - 1, 0);
                this._highlightOption(options);
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (this._highlightedIndex >= 0) {
                    const val = options[this._highlightedIndex]?.dataset.value;
                    if (val !== undefined) this._selectByValue(val);
                }
                break;
            case 'Escape':
                this._close();
                break;
            case 'Tab':
                this._close();
                break;
        }
    }

    _highlightOption(options) {
        options.forEach((el, i) => {
            el.toggleAttribute('data-highlighted', i === this._highlightedIndex);
            if (i === this._highlightedIndex) el.scrollIntoView({ block: 'nearest' });
        });
    }

    // ── Estado del dropdown ──────────────────────────────────────────────────

    _isOpen() { return this._dropdown.hasAttribute('data-open'); }

    _open() {
        // Mover el dropdown al portal correcto en cada apertura.
        // Si el componente vive dentro de un <dialog> abierto, debe estar
        // dentro de él (mismo top layer). De lo contrario usa <body>.
        const portal = this._getPortal();
        if (this._dropdown.parentNode !== portal) {
            portal.appendChild(this._dropdown);
        }

        this._dropdown.setAttribute('data-open', '');
        this._container.setAttribute('data-open', ''); // rota el chevron
        this._positionDropdown();

        // Reposicionar si el usuario hace scroll o redimensiona la ventana
        this._boundReposition = () => {
            if (this._isOpen()) this._positionDropdown();
        };
        window.addEventListener('scroll', this._boundReposition, true);
        window.addEventListener('resize', this._boundReposition);
    }

    _close() {
        this._dropdown.removeAttribute('data-open');
        this._container.removeAttribute('data-open'); // revierte el chevron
        this._highlightedIndex = -1;

        // Limpiar listeners de reposicionamiento
        if (this._boundReposition) {
            window.removeEventListener('scroll', this._boundReposition, true);
            window.removeEventListener('resize', this._boundReposition);
            this._boundReposition = null;
        }
    }

    _toggle(force) { force ? this._open() : this._close(); }

    /**
     * Posiciona el dropdown con position:fixed relativo al trigger.
     * Se abre hacia arriba automáticamente si no hay espacio suficiente abajo.
     */
    _positionDropdown() {
        const rect = this._trigger.getBoundingClientRect();
        const vh   = window.innerHeight;
        const dd   = this._dropdown;
        const gap  = 4;

        // Ancho y alineación horizontal iguales al trigger
        dd.style.width = `${rect.width}px`;
        dd.style.left  = `${rect.left}px`;

        // Calcular espacio disponible abajo y arriba
        const spaceBelow = vh - rect.bottom - gap;
        const spaceAbove = rect.top - gap;
        const ddHeight   = dd.offsetHeight;

        if (spaceBelow >= ddHeight || spaceBelow >= spaceAbove) {
            // Abrir hacia abajo
            dd.style.top    = `${rect.bottom + gap}px`;
            dd.style.bottom = 'auto';
        } else {
            // Abrir hacia arriba
            dd.style.top    = 'auto';
            dd.style.bottom = `${vh - rect.top + gap}px`;
        }
    }

    _resetViewState() {
        if (this._searchInp) this._searchInp.value = '';
        if (this._searchClear) this._searchClear.hidden = true;
        this._optionsBox.scrollTop = 0;

        if (this._serverSide) {
            this._currentPage = 1;
            this.fetchItems(this._config.url);
        } else {
            this._renderOptions([...this._items]);
        }
    }

    // ── Normalización ────────────────────────────────────────────────────────

    _normalizeItems(items) {
        const lk = this._config.labelKey ?? 'label';
        const vk = this._config.valueKey ?? 'value';

        return items.map(item => {
            if (typeof item === 'string') return { label: item, value: item, original: item };
            if (typeof item === 'object' && item !== null) {
                return {
                    label:    String(item[lk] ?? JSON.stringify(item)),
                    value:    String(item[vk] ?? item[lk]),
                    original: item,
                };
            }
            return { label: String(item), value: String(item), original: item };
        });
    }

    // ── Renderizado de opciones ──────────────────────────────────────────────

    _renderOptions(dataToRender = null) {
        if (this._showingMessage && dataToRender === null) return;

        if (dataToRender !== null) this._filteredData = dataToRender;

        this._optionsBox.innerHTML   = '';
        this._nativeSelect.innerHTML = '';
        this._loadedCount = 0;

        if (this._filteredData.length === 0) {
            this._showMessage('Sin resultados');
            return;
        }

        this._showingMessage = false;
        this._appendBatch();
        this._checkOverflow();
    }

    _appendBatch() {
        const end = this._serverSide
            ? this._filteredData.length
            : this._loadedCount + this._batchSize;

        const batch = this._filteredData.slice(this._loadedCount, end);
        if (batch.length === 0) return;

        const fragCustom = document.createDocumentFragment();
        const fragNative = document.createDocumentFragment();

        batch.forEach(item => {
            // Opción personalizada
            const div = document.createElement('div');
            div.className     = 'select-option';
            div.textContent   = item.label;
            div.dataset.value = item.value;
            div.setAttribute('role', 'option');
            div.setAttribute('aria-selected', this._selected?.value === item.value ? 'true' : 'false');
            if (this._selected?.value === item.value) div.setAttribute('data-selected', '');
            div.addEventListener('click', () => this._selectByValue(item.value));
            fragCustom.appendChild(div);

            // Opción nativa (accesibilidad / forms)
            const opt = document.createElement('option');
            opt.value       = item.value;
            opt.textContent = item.label;
            fragNative.appendChild(opt);
        });

        this._optionsBox.appendChild(fragCustom);
        this._nativeSelect.appendChild(fragNative);
        this._loadedCount += batch.length;
    }

    _showMessage(html) {
        this._optionsBox.innerHTML = `<p class="select-message">${html}</p>`;
        this._optionsBox.classList.add('no-scroll');
        this._showingMessage = true;
    }

    _checkOverflow() {
        const hasScroll = this._optionsBox.scrollHeight > this._optionsBox.clientHeight;
        this._optionsBox.classList.toggle('no-scroll', !hasScroll);
    }

    // ── Fetch ────────────────────────────────────────────────────────────────

    /**
     * Carga items desde una URL.
     * Si se configuró `fetchFn`, la usa; de lo contrario usa el fetch nativo.
     *
     * @param {string}  url
     * @param {boolean} append — true para scroll infinito (agrega en vez de reemplazar)
     */
    async fetchItems(url, append = false) {
        if (this._isLoading) return;
        this._isLoading = true;

        // ── Construir URL final (con parámetros server-side) ──
        const finalUrl = new URL(url, window.location.origin);

        if (this._serverSide) {
            const term = this._searchInp?.value.trim() ?? '';
            finalUrl.searchParams.set('page',  this._currentPage);
            finalUrl.searchParams.set('limit', this._limit);
            if (term) finalUrl.searchParams.set('search', term);
        }

        const cacheKey = finalUrl.toString();

        // ── BLOQUE 1: Caché ──
        if (this._serverSide && this._fetchCache.has(cacheKey)) {
            const cached = this._fetchCache.get(cacheKey);
            this._lastFetchKey   = cacheKey;
            this._lastPage       = cached.lastPage;
            this._showingMessage = false;
            this._isLoading      = false;

            const normalized = cached.items;

            if (append) {
                this._items        = [...this._items, ...normalized];
                this._filteredData = [...this._items];
                this._appendBatch();
            } else {
                this._items = [...normalized];
                if (this._addPlaceholderOption && !this._searchInp?.value) {
                    // Evitar duplicados si el backend manda un value vacío
                    this._items = this._items.filter(i => String(i.value) !== '');
                    this._items.unshift({ label: this._placeholder, value: '', original: null });
                }
                this._filteredData = [...this._items];
                this._renderOptions();
            }
            return;
        }

        if (!append) {
            this._showMessage(ICON_SPINNER);
            this._currentPage          = 1;
            this._optionsBox.scrollTop = 0;
        }

        try {
            // ── Petición ──
            let data;
            if (typeof this._fetchFn === 'function') {
                data = await this._fetchFn(finalUrl.toString());
            } else {
                const res = await fetch(finalUrl.toString(), {
                    headers: { 'Accept': 'application/json' },
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                data = await res.json();
            }

            // ── Extracción ──
            const root = this._config.dataPath
                ? extractByPath(data, this._config.dataPath)
                : data;

            let rawItems;
            if (this._serverSide) {
                rawItems       = Array.isArray(root) ? root : (root?.items ?? []);
                this._lastPage = root?.meta?.last_page ?? root?.last_page ?? 1;
            } else {
                rawItems = Array.isArray(root) ? root : (root?.data ?? root?.items ?? []);
            }

            const normalized = this._normalizeItems(rawItems);
            this._showingMessage = false;

            // ── Guardar en caché (solo server-side) ──
            if (this._serverSide) {
                this._fetchCache.set(cacheKey, {
                    items:    normalized,
                    lastPage: this._lastPage,
                });
                this._lastFetchKey = cacheKey;
            }

            // ── BLOQUE 2: Respuesta de Red (AQUÍ ESTABA EL SEGUNDO BUG) ──
            if (append) {
                this._items        = [...this._items, ...normalized];
                this._filteredData = [...this._items];
                this._appendBatch();
            } else {
                // SOLUCIÓN FINAL: Creamos un nuevo array y filtramos posibles vacíos
                this._items = [...normalized];
                
                if (this._addPlaceholderOption && !this._searchInp?.value) {
                    // Evitar duplicados si el backend manda un value vacío
                    this._items = this._items.filter(i => String(i.value) !== '');
                    this._items.unshift({ label: this._placeholder, value: '', original: null });
                }
                this._filteredData = [...this._items];
                this._renderOptions();
            }
        } catch (err) {
            console.error('[Select] fetchItems error:', err);
            this._showMessage('Error al cargar los datos.');
        } finally {
            this._isLoading = false;
        }
    }

    /**
     * Invalida el caché server-side completo o solo una clave específica.
     * Útil para forzar una nueva petición tras mutaciones (crear, editar, borrar).
     * @param {string} [key] — Si se omite, limpia todo el caché.
     */
    invalidateCache(key) {
        if (key) {
            this._fetchCache.delete(key);
        } else {
            this._fetchCache.clear();
            this._lastFetchKey = null;
        }
    }

    // ── Selección ────────────────────────────────────────────────────────────

    _selectByValue(value) {
        const idx = this._items.findIndex(i => i.value === value);
        this.select(idx);
    }

    /**
     * Selecciona un ítem por su índice en `_items`.
     * @param {number} index
     */
    select(index) {
        const item = this._items[index];
        if (!item) return;

        if (this._addPlaceholderOption && item.value === '') {
            this._selected = null;
            this._trigger.querySelector('.select-label').textContent = this._placeholder;
            this._container.removeAttribute('data-has-selection');
            if (this._onChange) this._onChange(null, this);
        } else {
            this._selected = item;
            this._trigger.querySelector('.select-label').textContent = item.label;
            this._container.setAttribute('data-has-selection', '');
            if (this._onChange) this._onChange(item, this);
        }

        if (this._searchInp) this._searchInp.value = '';
        this._close();

        this._renderOptions();

        this._isSyncing = true;
        this._nativeSelect.value = this._selected ? this._selected.value : '';
        this._isSyncing = false;

        this._nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ── API pública ──────────────────────────────────────────────────────────

    /** Devuelve el value actual o null */
    getValue() {
        return this._nativeSelect.value || null;
    }

    /** Devuelve el ítem seleccionado completo o null */
    getSelected() {
        return this._selected;
    }

    /** Selecciona un ítem por su value */
    setValue(value) {
        const idx = this._items.findIndex(i => i.value == String(value));
        if (idx !== -1) {
            this.select(idx);
        } else {
            this.reset();
        }
    }

    /** Reemplaza la lista de items */
    setItems(newItems) {
        this._items = this._normalizeItems(newItems);
        if (this._addPlaceholderOption) {
            this._items.unshift({ label: this._placeholder, value: '', original: null });
        }
        this._filteredData   = [...this._items];
        this._showingMessage = false;
        this._renderOptions();
    }

    /** Resetea la selección (compatible con form.reset) */
    reset() {
        this.clearValidation();
        this._selected = null;
        this._trigger.querySelector('.select-label').textContent = this._placeholder;
        this._container.removeAttribute('data-has-selection');

        this._isSyncing = true;
        this._nativeSelect.innerHTML = '';
        this._nativeSelect.value = '';
        this._isSyncing = false;

        this._renderOptions();
        if (this._onChange) this._onChange(null, this);
    }

    // ── Validación ───────────────────────────────────────────────────────────

    markAsInvalid() {
        this._container.removeAttribute('data-valid');
        this._container.setAttribute('data-invalid', '');
    }

    markAsValid() {
        this._container.removeAttribute('data-invalid');
    }

    clearValidation() {
        this._container.removeAttribute('data-invalid');
        this._container.removeAttribute('data-valid');
    }

    // ── Proxy del value nativo ───────────────────────────────────────────────

    _proxyNativeValue() {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        if (!descriptor?.set || !descriptor?.get) return;

        const self = this;
        Object.defineProperty(this._nativeSelect, 'value', {
            configurable: true,
            enumerable:   true,
            get: function ()       { return descriptor.get.call(this); },
            set: function (newVal) {
                descriptor.set.call(this, newVal);
                if (self._isSyncing) return;
                self.setValue(newVal);
            },
        });
    }

    // ── Destrucción ──────────────────────────────────────────────────────────

    destroy() {
        this._close(); // limpia listeners de scroll/resize antes de destruir
        if (this._parentForm) {
            this._parentForm.removeEventListener('reset', this._boundReset);
        }
        // Remover el dropdown del portal donde fue insertado
        this._dropdown?.parentNode?.removeChild(this._dropdown);
        this._container.classList.remove('select-wrapper');
        this._container.innerHTML = '';
        this._fetchCache.clear();
        Select.instances = Select.instances.filter(inst => inst !== this);
    }

    // ── Utilidades ───────────────────────────────────────────────────────────

    /**
     * Devuelve el nodo donde se debe insertar el dropdown como portal.
     *
     * Un <dialog> abierto ocupa el "top layer" del navegador, una capa
     * especial que está por encima de cualquier z-index del DOM normal.
     * Por eso, si el componente vive dentro de un <dialog>, el dropdown
     * debe insertarse dentro de ese mismo <dialog> para ser visible.
     * En cualquier otro caso se usa <body>.
     */
    _getPortal() {
        const dialog = this._container.closest('dialog');
        return (dialog && dialog.open) ? dialog : document.body;
    }

    _escHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}