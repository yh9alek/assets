/**
 * Grid - Vanilla JavaScript
 * Sin dependencias externas.
 *
 * Reemplazos realizados:
 *  - sweetalert2      → loader/modal nativos (métodos showLoader / closeLoader / showError)
 *  - httpGet / http-client → fetch nativo con manejo de errores propio
 *  - zod              → eliminado (sin validación de esquema)
 *  - authStore        → se acepta un token opcional vía options.token o función options.getToken()
 *  - mensajeError / mostrarLoader → implementaciones nativas internas
 */

export class Grid {

    // ─────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────

    constructor(container, url, options = {}) {
        // 1. Identificar el contenedor original
        const originalContainer =
            typeof container === 'string'
                ? document.querySelector(container)
                : container;

        if (!originalContainer) {
            throw new Error(`El contenedor "${container}" no fue encontrado.`);
        }

        // 2. Crear y configurar el wrapper
        this.grid_container = document.createElement('div');
        this.grid_container.classList.add('grid-container');

        if (originalContainer.parentElement) {
            originalContainer.parentElement.insertBefore(this.grid_container, originalContainer);
        }
        this.grid_container.appendChild(originalContainer);

        // 3. Asignar el contenedor interno
        this.container = originalContainer;
        this.container.classList.add('grid-t');

        // 4. Configuración inicial
        this.url             = url;
        this.columns         = options.columns        || [];
        this.rowsPerPage     = options.rowsPerPage    || 7;
        // dataPath: ruta al objeto raíz de la respuesta JSON
        // serverSide: apunta al objeto { items, meta } — ej: '' (raíz) o 'data'
        // clientSide: apunta al array — ej: 'items' o 'data.users'
        this.dataPath = 'dataPath' in options ? options.dataPath : '';
        this.serverSide      = options.serverSide     || false;
        this.padding         = options.padding        || '6px';
        this.searchPlaceholder = options.searchPlaceholder || 'Buscar...';
        this.alignCells      = options.alignCells     || 'left';
        this.marginBottom    = options.marginBottom   || '70px';
        this.searching       = options.searching !== false;
        this.pagination      = options.pagination !== false;
        this.headerButton    = options.headerButton   || null;

        // Token de autenticación: puede ser string fijo o función que lo devuelve
        this._getToken = typeof options.getToken === 'function'
            ? options.getToken
            : () => options.token || null;

        // Estado interno
        this.paginationMeta       = {};
        this.originalData         = [];
        this.filteredData         = [];
        this.currentPage          = 1;
        this.searchDebounceTimer  = null;
        this.elements             = {};

        this._init();
    }

    // ─────────────────────────────────────────────
    //  Inicialización
    // ─────────────────────────────────────────────

    async _init() {
        this._buildDOM();
        await this.fetchAndUpdateView();
    }

    _buildDOM() {
        this.container.innerHTML = '';
        this.container.style.position = 'relative';
        this.container.style.overflow = 'visible';

        this._buildSearchBar();
        this._buildTable();
        this._buildPagination();
    }

    // ─────────────────────────────────────────────
    //  Fetch de datos (reemplaza httpGet + authStore)
    // ─────────────────────────────────────────────

    async _fetchData() {
        try {
            const finalUrl = new URL(this.url, window.location.origin);

            if (this.serverSide) {
                finalUrl.searchParams.append('page',  this.currentPage.toString());
                finalUrl.searchParams.append('limit', this.rowsPerPage.toString());

                const searchQuery = this.elements.searchInput?.value;
                if (this.searching && searchQuery) {
                    finalUrl.searchParams.append('search', searchQuery);
                }
            }

            // Cabeceras
            const headers = { 'Content-Type': 'application/json' };
            const token = this._getToken();
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(finalUrl.toString(), { headers });

            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                const msg  = body?.message || `HTTP ${response.status}: ${response.statusText}`;
                throw new GridHttpError(msg, response.status);
            }

            const json = await response.json();

            if (this.serverSide) {
                // En server-side el dataPath apunta al objeto raíz { items, meta }
                // Si dataPath está vacío, el objeto raíz es la respuesta completa
                const root = this.dataPath ? this._getNestedValue(json, this.dataPath) : json;
                if (root && typeof root === 'object') {
                    this.paginationMeta = root.meta || {};
                    const items = root.items ?? root.data ?? root;
                    if (!Array.isArray(items)) throw new Error('No se encontró un array de items en la respuesta');
                    return items;
                }
                throw new Error('La estructura de respuesta server-side es inválida');
            } else {
                // En client-side el dataPath apunta directamente al array
                const root = this.dataPath ? this._getNestedValue(json, this.dataPath) : json;
                if (!Array.isArray(root)) throw new Error('La fuente de datos no es un array');
                return root;
            }

        } catch (error) {
            this._handleError(error);
            this._renderEmptyTable('ERROR AL CARGAR LOS DATOS');
            return null;
        }
    }

    // ─────────────────────────────────────────────
    //  Manejo de errores (reemplaza mensajeError + Swal)
    // ─────────────────────────────────────────────

    _handleError(error) {
        this._closeLoader();

        let title = '';

        if (error instanceof GridHttpError) {
            title = error.message;
        } else if (error instanceof Error) {
            title = error.message || 'Error desconocido';
        }

        this._showError('Error en Grid', title || 'Ha ocurrido un error inesperado');
    }

    /**
     * Muestra un overlay de carga nativo.
     * Puede sobreescribirse asignando Grid.prototype._showLoader = fn.
     */
    _showLoader() {
        if (this._loaderEl) return;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 9999;
            background: rgba(0,0,0,.35);
            display: flex; align-items: center; justify-content: center;
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: #fff; border-radius: 12px;
            padding: 28px 40px; text-align: center;
            font-family: sans-serif; font-size: 14px; color: #333;
            box-shadow: 0 4px 24px rgba(0,0,0,.2);
        `;
        box.innerHTML = `
            <div style="
                width:36px; height:36px; margin:0 auto 14px;
                border:4px solid #e0e0e0;
                border-top-color:#555;
                border-radius:50%;
                animation: grid-spin .7s linear infinite;
            "></div>
            <span>Cargando...</span>
            <style>
                @keyframes grid-spin { to { transform: rotate(360deg); } }
            </style>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);
        this._loaderEl = overlay;
    }

    _closeLoader() {
        if (this._loaderEl) {
            this._loaderEl.remove();
            this._loaderEl = null;
        }
    }

    /**
     * Muestra un diálogo de error nativo.
     * Puede sobreescribirse asignando Grid.prototype._showError = fn.
     */
    _showError(title, message) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 10000;
            background: rgba(0,0,0,.4);
            display: flex; align-items: center; justify-content: center;
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: #fff; border-radius: 12px;
            padding: 28px 36px; max-width: 360px; width: 90%;
            font-family: sans-serif; text-align: center;
            box-shadow: 0 4px 24px rgba(0,0,0,.2);
        `;
        box.innerHTML = `
            <div style="font-size:40px; margin-bottom:10px;">⚠️</div>
            <h3 style="margin:0 0 8px; color:#c0392b; font-size:16px;">${title}</h3>
            <p style="margin:0 0 20px; color:#555; font-size:13px;">${message}</p>
            <button style="
                background:#c0392b; color:#fff; border:none;
                padding:8px 24px; border-radius:6px; cursor:pointer; font-size:13px;
            ">Aceptar</button>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);
        box.querySelector('button').onclick = () => overlay.remove();
    }

    // ─────────────────────────────────────────────
    //  API pública
    // ─────────────────────────────────────────────

    async fetchAndUpdateView() {
        this._showLoader();

        const data = await this._fetchData();

        if (data === null) return;

        this.originalData = data;

        if (!this.serverSide) {
            this._applyClientSideFilter();
        }

        if (this.columns.length === 0 && data.length > 0) {
            this.columns = Object.keys(data[0]).map(key => ({ key, label: key }));
            this._buildTable();
        }

        this._updateView();
        this._closeLoader();
    }

    async recargarDatos() {
        await this.fetchAndUpdateView();
    }

    // ─────────────────────────────────────────────
    //  Construcción del DOM
    // ─────────────────────────────────────────────

    _buildSearchBar() {
        if (!this.searching && !this.headerButton) return;

        const wrapper = this._createEl('div', 'grid-header-actions', {
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            position: 'relative',
        });

        // Botón izquierdo
        if (this.headerButton) {
            const btn = document.createElement('button');
            btn.className = this.headerButton.className || 'btn btn-primary';
            btn.style.display = 'inline-flex';
            btn.style.alignItems = 'center';
            btn.style.gap = '8px';
            btn.innerHTML = `
                <span class="material-symbols-rounded" style="font-size:20px;">${this.headerButton.icon}</span>
                <span>${this.headerButton.text}</span>
            `;
            btn.onclick = () => this.headerButton.onClick(this);
            wrapper.appendChild(btn);
        } else {
            wrapper.appendChild(document.createElement('div'));
        }

        // Buscador derecho
        if (this.searching) {
            const searchContainer = this._createEl('div', 'search-container', {
                position: 'relative', display: 'flex', alignItems: 'center',
            });

            const searchIcon = this._createEl('span', 'material-symbols-rounded', {
                position: 'absolute', left: '10px', top: '7px',
                fontSize: '20px', color: '#888', pointerEvents: 'none',
            });
            searchIcon.textContent = 'search';

            const input = this._createEl('input', '', {
                padding: '6px 32px 7px 38px', width: 'auto',
                border: '1px solid #ccc', borderRadius: '6px', outline: 'none',
            });
            input.placeholder = this.searchPlaceholder;

            const clearBtn = this._createEl('button', 'btn-clear', {
                position: 'absolute', right: '8px', top: '7px',
                border: 'none', background: 'none', display: 'none', color: '#DF6F58',
            });
            clearBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:20px;">close</span>';

            clearBtn.addEventListener('click', () => {
                input.value = '';
                input.dispatchEvent(new Event('input'));
            });

            input.addEventListener('input', () => {
                if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
                this.searchDebounceTimer = window.setTimeout(() => {
                    this.currentPage = 1;
                    this.serverSide
                        ? this.fetchAndUpdateView()
                        : (this._applyClientSideFilter(), this._updateView());
                }, 300);
            });

            searchContainer.append(searchIcon, clearBtn, input);
            wrapper.appendChild(searchContainer);
            this.elements.searchInput = input;
            this.elements.btnClear    = clearBtn;
        }

        this.container.appendChild(wrapper);
    }

    _buildTable() {
        let table = this.container.querySelector('table');

        if (!table) {
            table = this._createEl('table', 'table-bordered', this._tableStyles());
            table.createTHead();
            this.elements.tbody = document.createElement('tbody');
            table.appendChild(this.elements.tbody);

            const tableWrapper = this._createEl('div', 'grid-table-container', {
                width: '100%', overflowX: 'auto', position: 'relative',
            });
            tableWrapper.appendChild(table);
            this.container.appendChild(tableWrapper);
        }
    }

    _buildPagination() {
        if (!this.pagination) return;

        const nav = this._createEl('div', 'paginacion', {
            display: 'flex', gap: '16px', justifyContent: 'end',
            alignItems: 'center', marginTop: '10px',
            position: 'absolute', right: '0',
        });

        const prev = this._createEl('button', 'btn-p');
        prev.innerHTML = '<span class="material-symbols-rounded" style="color:#fff;">chevron_left</span>';

        const next = this._createEl('button', 'btn-p');
        next.innerHTML = '<span class="material-symbols-rounded" style="color:#fff;">chevron_right</span>';

        const info    = this._createEl('span');
        const regInfo = this._createEl('p', 'registros', { position: 'absolute', bottom: '20px' });

        prev.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.serverSide ? this.fetchAndUpdateView() : this._updateView();
            }
        });

        next.addEventListener('click', () => {
            const totalPages = this.serverSide
                ? (this.paginationMeta.last_page || 1)
                : Math.ceil(this.filteredData.length / this.rowsPerPage);

            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.serverSide ? this.fetchAndUpdateView() : this._updateView();
            }
        });

        nav.append(prev, info, next);
        this.container.append(nav, regInfo);

        this.elements.btnPrev           = prev;
        this.elements.btnNext           = next;
        this.elements.pageInfo          = info;
        this.elements.showInfo          = regInfo;
        this.elements.paginationWrapper = nav;

        this._updatePagination();
    }

    // ─────────────────────────────────────────────
    //  Actualización de la vista
    // ─────────────────────────────────────────────

    _applyClientSideFilter() {
        const query = this.elements.searchInput
            ? this.elements.searchInput.value.toLowerCase().trim()
            : '';

        if (!query) {
            this.filteredData = [...this.originalData];
            return;
        }
        this.filteredData = this.originalData.filter(item =>
            this.columns.some(col => {
                if (col.render) return false;
                const val = this._getNestedValue(item, col.key);
                return String(val).toLowerCase().includes(query);
            })
        );
    }

    _updateView() {
        if (this.searching && this.elements.btnClear && this.elements.searchInput) {
            const query = this.elements.searchInput.value;
            this.elements.btnClear.style.display = query ? 'block' : 'none';
        }

        this._updateTableBody();
        this._updatePagination();
    }

    _updateTableHeaders(hasData) {
        const table = this.container.querySelector('table');
        if (!table || !table.tHead) return;

        const thead = table.tHead;
        thead.innerHTML = '';
        const row = thead.insertRow();

        if (hasData) {
            this.columns.forEach(col => {
                const th = document.createElement('th');
                th.textContent = col.label || col.key;
                th.style.padding   = this.padding;
                th.style.textAlign = this.alignCells;

                if (col.key === 'actions') {
                    th.style.width     = '1%';
                    th.style.whiteSpace = 'nowrap';
                }
                row.appendChild(th);
            });
        } else {
            const th = document.createElement('th');
            th.innerHTML       = '&nbsp;';
            th.style.padding   = this.padding;
            row.appendChild(th);
        }
    }

    _updateTableBody() {
        const { tbody } = this.elements;
        if (!tbody) return;

        let pageData;
        if (this.serverSide) {
            pageData = this.originalData;
        } else {
            const start = (this.currentPage - 1) * this.rowsPerPage;
            pageData = this.filteredData.slice(start, start + this.rowsPerPage);
        }

        const hasData = pageData.length > 0;
        this._updateTableHeaders(hasData);

        const fragment = document.createDocumentFragment();

        if (!hasData) {
            const tr = document.createElement('tr');
            const td = tr.insertCell();
            td.colSpan    = 1;
            td.textContent = 'SIN REGISTROS';
            Object.assign(td.style, {
                textAlign:  'center',
                padding:    this.padding,
                color:      '#4E515A',
                fontWeight: '500',
            });
            fragment.appendChild(tr);
        } else {
            pageData.forEach(row => {
                const tr = document.createElement('tr');
                this.columns.forEach(col => {
                    const td = tr.insertCell();
                    td.style.padding   = this.padding;
                    td.style.textAlign = this.alignCells;

                    if (col.key === 'actions') {
                        td.style.width      = '1%';
                        td.style.whiteSpace = 'nowrap';
                        td.style.textAlign  = 'center';
                    }

                    if (typeof col.render === 'function') {
                        const content = col.render(row);

                        // Convierte cualquier valor a un Node válido
                        const toNode = (item) => {
                            if (item instanceof Node) return item;
                            if (typeof item === 'string') {
                                const tmp = document.createElement('div');
                                tmp.innerHTML = item.trim();
                                // Si solo hay un elemento hijo lo devuelve directo, si hay varios los agrupa
                                return tmp.childElementCount === 1
                                    ? tmp.firstElementChild
                                    : tmp;
                            }
                            return document.createTextNode(String(item));
                        };

                        // Helper: crea un wrapper inline-flex ajustado al contenido
                        const makeWrapper = () => {
                            const w = document.createElement('div');
                            w.style.display        = 'flex';
                            w.style.gap            = '6px';
                            w.style.justifyContent = 'center';
                            w.style.alignItems     = 'center';
                            w.style.width          = '100%';
                            return w;
                        };

                        if (Array.isArray(content)) {
                            // Array mixto: nodos, strings HTML o primitivos
                            const wrapper = makeWrapper();
                            content.forEach(item => wrapper.appendChild(toNode(item)));
                            td.appendChild(wrapper);

                        } else if (typeof content === 'string') {
                            // String HTML directo
                            const wrapper = makeWrapper();
                            wrapper.innerHTML = content.trim();
                            td.appendChild(wrapper);

                        } else if (content instanceof Node) {
                            // Nodo único → directo sin wrapper
                            td.appendChild(content);

                        } else {
                            td.appendChild(document.createTextNode(String(content)));
                        }
                    } else {
                        const val = this._getNestedValue(row, col.key);
                        td.textContent = val !== undefined && val !== null ? String(val) : '';
                    }
                });
                fragment.appendChild(tr);
            });
        }

        tbody.innerHTML = '';
        tbody.appendChild(fragment);
    }

    _updatePagination() {
        if (!this.pagination || !this.elements.pageInfo || !this.elements.showInfo) return;

        let totalPages, totalRecords, from, to;

        if (this.serverSide) {
            totalPages   = this.paginationMeta.last_page || 1;
            totalRecords = this.paginationMeta.total     || 0;
            from         = this.paginationMeta.from      || 0;
            to           = this.paginationMeta.to        || 0;
        } else {
            totalPages   = Math.ceil(this.filteredData.length / this.rowsPerPage) || 1;
            totalRecords = this.filteredData.length;
            from         = totalRecords === 0 ? 0 : (this.currentPage - 1) * this.rowsPerPage + 1;
            to           = Math.min(this.currentPage * this.rowsPerPage, totalRecords);
        }

        const hasData = totalRecords > 0;

        if (this.elements.paginationWrapper) {
            this.elements.paginationWrapper.style.display = hasData ? 'flex' : 'none';
        }
        if (this.elements.showInfo) {
            this.elements.showInfo.style.display = hasData ? 'block' : 'none';
        }

        this.container.style.marginBottom = hasData ? this.marginBottom : '0';
        if (!hasData) return;

        this.elements.pageInfo.innerHTML = `Pag. <b>${this.currentPage}</b> de <b>${totalPages}</b>`;

        if (this.serverSide) {
            this.elements.showInfo.innerHTML =
                `Mostrando <b style="font-size: 14px;"> ${from} </b> a <b style="font-size: 14px;"> ${to} </b> de <b style="font-size: 14px;"> ${totalRecords} </b> registros`;
        } else {
            this.elements.showInfo.innerHTML = `<b>${totalRecords}</b> Registros`;
        }

        if (this.elements.btnPrev) this.elements.btnPrev.disabled = this.currentPage === 1;
        if (this.elements.btnNext) this.elements.btnNext.disabled = this.currentPage >= totalPages;
    }

    _renderEmptyTable(message) {
        this.container.innerHTML = '';
        const table = this._createEl('table', '', this._tableStyles());
        const thead = table.createTHead();
        const row   = thead.insertRow();
        const th    = document.createElement('th');
        th.textContent = ' ';
        th.style.padding = this.padding;
        row.appendChild(th);

        const tbody = document.createElement('tbody');
        const tr    = tbody.insertRow();
        const td    = tr.insertCell();
        td.colSpan      = 1;
        td.textContent  = message;
        td.style.padding    = this.padding;
        td.style.textAlign  = 'center';
        td.style.fontWeight = '500';
        td.style.color      = '#EB755D';

        table.appendChild(tbody);
        this.container.appendChild(table);
    }

    // ─────────────────────────────────────────────
    //  Utilidades privadas
    // ─────────────────────────────────────────────

    _createEl(tag, className = '', styles = {}, text = '') {
        const el = document.createElement(tag);
        if (className) el.className = className;
        Object.assign(el.style, styles);
        if (text) el.textContent = text;
        return el;
    }

    _tableStyles() {
        return {
             width:          'calc(100% - 1px)',
            borderCollapse:  'collapse',
            tableLayout:     'auto',
            marginTop:       '0',
        };
    }

    _getNestedValue(obj, keyPath) {
        return keyPath.split('.').reduce((acc, key) => acc?.[key], obj);
    }

    // ─────────────────────────────────────────────
    //  Método estático de utilidad
    // ─────────────────────────────────────────────

    /**
     * Crea un botón de acción para usar en columnas personalizadas.
     *
     * @param {object} opts
     * @param {string}      opts.title      - Tooltip del botón
     * @param {string}      opts.icon       - Nombre del icono (Material Symbols)
     * @param {object}      [opts.attributes] - Atributos HTML adicionales
     * @param {string|null} [opts.color]    - Color del icono
     * @param {Function|null} [opts.onClick] - Handler de click
     * @returns {HTMLButtonElement}
     */
    static createAction({ title, icon, attributes = {}, color = null, onClick = null }) {
        const btn = document.createElement('button');

        btn.innerHTML = `
            <span class="material-symbols-rounded"
                  style="color:${color || 'inherit'}; vertical-align:middle; font-size:18px;">
                ${icon}
            </span>
        `;
        btn.title = title;
        btn.classList.add('grid-button');
        btn.style.display    = 'grid';
        btn.style.placeItems = 'center';
        btn.style.height     = '30px';

        if (onClick) btn.onclick = onClick;

        for (const [key, value] of Object.entries(attributes)) {
            btn.setAttribute(key, value);
        }

        return btn;
    }
}

// ─────────────────────────────────────────────
//  Error personalizado para respuestas HTTP
// ─────────────────────────────────────────────

class GridHttpError extends Error {
    constructor(message, status) {
        super(message);
        this.name   = 'GridHttpError';
        this.status = status;
    }
}