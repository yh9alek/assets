/**
 * ─── FormValidator ────────────────────────────────────────────────────────────
 *
 * Validador de formularios compatible con los componentes:
 *   · x-input.text  (input nativo con clase DaisyUI → input-error)
 *   · Select        (componente custom → data-invalid / data-valid)
 *   · <select>      (select nativo)
 *   · <textarea>
 *   · radio buttons (grupos)
 *   · checkboxes    (individuales o grupos)
 *
 * Uso básico:
 *
 *   import { FormValidator } from './form-validator.js';
 *
 *   const validator = new FormValidator('#mi-form');
 *   validator.validate();   // → true | false
 *   validator.reset();      // limpia todos los estados
 *
 * Uso con submit:
 *
 *   const validator = new FormValidator('#mi-form', {
 *     onSubmit: (form, isValid) => {
 *       if (isValid) form.submit();
 *     },
 *   });
 *
 * Opciones:
 *
 *   @param {string | HTMLFormElement} form
 *   @param {object}  [options]
 *   @param {boolean} [options.validateOnChange=true]  — Revalida el campo al cambiar
 *   @param {boolean} [options.stopOnFirst=false]       — Detiene validación al primer error
 *   @param {string}  [options.errorClass='input-error'] — Clase DaisyUI para inputs inválidos
 *   @param {string}  [options.errorMsgClass='label text-error'] — Clase del mensaje de error
 *   @param {Function}[options.onSubmit]               — Callback (form, isValid) => void
 *   @param {object}  [options.messages]               — Mensajes personalizados por tipo
 */

export class FormValidator {

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(form, options = {}) {
        const el = typeof form === 'string' ? document.querySelector(form) : form;
        if (!el || el.tagName !== 'FORM') throw new Error('[FormValidator] Formulario no encontrado.');

        this._form = el;
        this._form._formValidator = this;
        this._opts = {
            validateOnChange: true,
            stopOnFirst:      false,
            errorClass:       'input-error',
            errorMsgClass:    'label text-error',
            onSubmit:         null,
            messages: {
                required:  'Este campo es obligatorio.',
                minlength: (min) => `Mínimo ${min} caracteres.`,
                maxlength: (max) => `Máximo ${max} caracteres.`,
                min:       (min) => `El valor mínimo es ${min}.`,
                max:       (max) => `El valor máximo es ${max}.`,
                pattern:   'El formato no es válido.',
                email:     'Ingresa un correo electrónico válido.',
                url:       'Ingresa una URL válida.',
                ...options.messages,
            },
            ...options,
        };

        // Registro de listeners para cleanup
        this._listeners = [];

        this._bindSubmit();
        if (this._opts.validateOnChange) this._bindChangeListeners();
    }

    // ── API pública ──────────────────────────────────────────────────────────

    /**
     * Ejecuta la validación completa del formulario.
     * @returns {boolean}
     */
    validate() {
        const fields = this._collectFields();
        let isValid  = true;

        for (const field of fields) {
            const ok = this._validateField(field);
            if (!ok) {
                isValid = false;
                if (this._opts.stopOnFirst) break;
            }
        }

        return isValid;
    }

    /** Limpia todos los estados de validación del formulario. */
    reset() {
        const fields = this._collectFields();
        for (const field of fields) {
            this._clearField(field);
        }
    }

    /** Destruye el validador y elimina todos los listeners. */
    destroy() {
        for (const { el, type, fn } of this._listeners) {
            el.removeEventListener(type, fn);
        }
        this._listeners = [];
    }

    // ── Recolección de campos ────────────────────────────────────────────────

    /**
     * Recolecta todos los campos validables del formulario.
     * Agrupa radios por name para tratarlos como una sola unidad.
     * @returns {FieldDescriptor[]}
     */
    _collectFields() {
        const fields       = [];
        const seenRadios   = new Set();
        const seenCheckGrp = new Set();

        const elements = this._form.querySelectorAll(
            'input, select, textarea, [data-select-wrapper]'
        );

        for (const el of elements) {
            // Ignorar campos deshabilitados, hidden y submit
            if (el.disabled || el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'reset' || el.hasAttribute('data-native-select')) continue;

            // ── Select custom (wrapper con [data-select-wrapper]) ──
            if (el.hasAttribute('data-select-wrapper')) {
                const native = el.querySelector('select');
                fields.push({ type: 'custom-select', wrapper: el, native });
                continue;
            }

            // ── Select nativo dentro de un custom-select — ya cubierto arriba ──
            const parentWrapper = el.closest('[data-select-wrapper]');
            if (parentWrapper) continue;

            // ── Radio buttons ──
            if (el.type === 'radio') {
                if (seenRadios.has(el.name)) continue;
                seenRadios.add(el.name);
                const group = [...this._form.querySelectorAll(`input[type="radio"][name="${el.name}"]`)];
                fields.push({ type: 'radio', name: el.name, group });
                continue;
            }

            // ── Checkboxes con data-group (grupo que exige al menos uno) ──
            if (el.type === 'checkbox' && el.dataset.group) {
                if (seenCheckGrp.has(el.dataset.group)) continue;
                seenCheckGrp.add(el.dataset.group);
                const group = [...this._form.querySelectorAll(`input[type="checkbox"][data-group="${el.dataset.group}"]`)];
                fields.push({ type: 'checkbox-group', groupName: el.dataset.group, group });
                continue;
            }

            // ── Checkbox individual ──
            if (el.type === 'checkbox') {
                fields.push({ type: 'checkbox', el });
                continue;
            }

            // ── Select nativo suelto ──
            if (el.tagName === 'SELECT') {
                fields.push({ type: 'select', el });
                continue;
            }

            // ── Textarea ──
            if (el.tagName === 'TEXTAREA') {
                fields.push({ type: 'textarea', el });
                continue;
            }

            // ── Input estándar (text, email, number, tel, url, password…) ──
            fields.push({ type: 'input', el });
        }

        return fields;
    }

    // ── Validación por campo ─────────────────────────────────────────────────

    /**
     * Valida un campo individual y aplica estilos + mensajes.
     * @param {object} field
     * @returns {boolean}
     */
    _validateField(field) {
        this._clearField(field);

        const errors = this._getErrors(field);

        if (errors.length) {
            this._markInvalid(field, errors[0]);
            return false;
        }

        this._markValid(field);
        return true;
    }

    /**
     * Devuelve array de mensajes de error para un campo.
     * Array vacío → campo válido.
     */
    _getErrors(field) {
        const msg    = this._opts.messages;
        const errors = [];

        switch (field.type) {

            // ── Custom Select ──────────────────────────────────────────────
            case 'custom-select': {
                const native = field.native;
                if (!native) break;
                if (native.required && !native.value) errors.push(msg.required);
                break;
            }

            // ── Select nativo ──────────────────────────────────────────────
            case 'select': {
                const { el } = field;
                if (el.required && !el.value) errors.push(msg.required);
                break;
            }

            // ── Radio group ────────────────────────────────────────────────
            case 'radio': {
                const anyRequired = field.group.some(r => r.required);
                const anyChecked  = field.group.some(r => r.checked);
                if (anyRequired && !anyChecked) errors.push(msg.required);
                break;
            }

            // ── Checkbox individual ────────────────────────────────────────
            case 'checkbox': {
                const { el } = field;
                if (el.required && !el.checked) errors.push(msg.required);
                break;
            }

            // ── Checkbox group ─────────────────────────────────────────────
            case 'checkbox-group': {
                const anyRequired = field.group.some(c => c.required);
                const anyChecked  = field.group.some(c => c.checked);
                if (anyRequired && !anyChecked) errors.push(msg.required);
                break;
            }

            // ── Textarea ───────────────────────────────────────────────────
            case 'textarea': {
                const { el } = field;
                const val    = el.value.trim();
                if (el.required && !val)                  errors.push(msg.required);
                if (el.minLength > 0 && val.length < el.minLength) errors.push(msg.minlength(el.minLength));
                if (el.maxLength > 0 && val.length > el.maxLength) errors.push(msg.maxlength(el.maxLength));
                break;
            }

            // ── Input estándar ─────────────────────────────────────────────
            case 'input': {
                const { el } = field;
                const val    = el.value.trim();

                if (el.required && !val) {
                    errors.push(msg.required);
                    break; // sin valor, no validar más constraints
                }

                if (!val) break; // campo vacío y no required → válido

                if (el.type === 'email' && !this._isEmail(val))    errors.push(msg.email);
                if (el.type === 'url'   && !this._isUrl(val))      errors.push(msg.url);
                if (el.minLength > 0    && val.length < el.minLength) errors.push(msg.minlength(el.minLength));
                if (el.maxLength > 0    && val.length > el.maxLength) errors.push(msg.maxlength(el.maxLength));
                if (el.min !== '' && el.type === 'number' && +val < +el.min) errors.push(msg.min(el.min));
                if (el.max !== '' && el.type === 'number' && +val > +el.max) errors.push(msg.max(el.max));
                if (el.pattern && !new RegExp(`^(?:${el.pattern})$`).test(val)) errors.push(msg.pattern);
                break;
            }
        }

        return errors;
    }

    // ── Aplicación de estilos ────────────────────────────────────────────────

    _markInvalid(field, message) {
        switch (field.type) {

            case 'custom-select':
                // Delega en la API pública del componente Select
                this._getSelectInstance(field.wrapper)?.markAsInvalid();
                // Muestra mensaje en el fieldset si existe
                this._showError(field.wrapper.closest('fieldset') ?? field.wrapper, message, 'select');
                break;

            case 'select':
                field.el.classList.add(this._opts.errorClass);
                this._showError(field.el.closest('fieldset') ?? field.el.parentElement, message, 'select');
                break;

            case 'radio':
            case 'checkbox-group': {
                // Marca visualmente el primer elemento del grupo
                field.group.forEach(el => el.classList.add(this._opts.errorClass));
                const container = field.group[0].closest('fieldset') ?? field.group[0].parentElement;
                this._showError(container, message, 'check');
                break;
            }

            case 'checkbox':
                field.el.classList.add(this._opts.errorClass);
                this._showError(field.el.closest('fieldset') ?? field.el.parentElement, message, 'check');
                break;

            case 'textarea':
                field.el.classList.add(this._opts.errorClass);
                this._showError(field.el.closest('fieldset') ?? field.el.parentElement, message, 'input');
                break;

            case 'input':
                field.el.classList.add(this._opts.errorClass);
                this._showError(field.el.closest('fieldset') ?? field.el.parentElement, message, 'input');
                break;
        }
    }

    _markValid(field) {
        switch (field.type) {

            case 'custom-select':
                this._getSelectInstance(field.wrapper)?.markAsValid();
                break;

            case 'select':
                field.el.classList.remove(this._opts.errorClass);
                break;

            case 'radio':
            case 'checkbox-group':
                field.group.forEach(el => el.classList.remove(this._opts.errorClass));
                break;

            case 'checkbox':
                field.el.classList.remove(this._opts.errorClass);
                break;

            case 'textarea':
            case 'input':
                field.el.classList.remove(this._opts.errorClass);
                break;
        }
    }

    _clearField(field) {
        switch (field.type) {

            case 'custom-select':
                this._getSelectInstance(field.wrapper)?.clearValidation();
                this._removeError(field.wrapper.closest('fieldset') ?? field.wrapper);
                break;

            case 'select':
                field.el.classList.remove(this._opts.errorClass);
                this._removeError(field.el.closest('fieldset') ?? field.el.parentElement);
                break;

            case 'radio':
            case 'checkbox-group': {
                field.group.forEach(el => el.classList.remove(this._opts.errorClass));
                const container = field.group[0].closest('fieldset') ?? field.group[0].parentElement;
                this._removeError(container);
                break;
            }

            case 'checkbox':
                field.el.classList.remove(this._opts.errorClass);
                this._removeError(field.el.closest('fieldset') ?? field.el.parentElement);
                break;

            case 'textarea':
            case 'input':
                field.el.classList.remove(this._opts.errorClass);
                this._removeError(field.el.closest('fieldset') ?? field.el.parentElement);
                break;
        }
    }

    // ── Mensajes de error ────────────────────────────────────────────────────

    /**
     * Inserta un <p> de error dentro del contenedor.
     * Reutiliza el <p> existente si ya está inyectado (data-fv-error).
     *
     * Para inputs dentro de un x-input.text el fieldset ya tiene un
     * <p class="label ..."> posicionado en absolute (igual que el hint).
     * Se reutiliza ese elemento si está presente.
     */
    _showError(container, message, context = 'input') {
        if (!container) return;

        // ── Reutilizar mensaje previo del validador ──
        let p = container.querySelector('[data-fv-error]');
        if (p) { p.textContent = message; return; }

        // ── Reutilizar el <p class="label"> del componente blade ──
        // El componente text.blade.php posiciona el hint/error en absolute.
        // Si existe un <p class="label"> sin data-fv-error, lo reusamos.
        let hintP = container.querySelector('p.label:not([data-fv-error])');
        if (hintP) {
            hintP.setAttribute('data-fv-error', '');
            hintP.setAttribute('data-fv-original', hintP.textContent); // guarda hint original
            hintP.className = this._opts.errorMsgClass;
            hintP.textContent = message;
            return;
        }

        // ── Crear nuevo nodo de error ──
        p = document.createElement('p');
        p.setAttribute('data-fv-error', '');
        p.className = this._opts.errorMsgClass;
        p.textContent = message;

        // Posicionamiento según contexto
        if (context === 'input') {
            // Imita el absolute -bottom-[7px] del componente text.blade.php
            p.style.cssText = 'position:absolute; bottom:0px; font-size:0.75rem;';
            // El fieldset debe ser relative (ya lo es en el componente)
            if (getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
        } else {
            // Select, radio, checkbox — flujo normal, solo igualamos el tamaño de fuente
            p.style.cssText = 'font-size:0.75rem;';
        }

        container.appendChild(p);
    }

    _removeError(container) {
        if (!container) return;

        const p = container.querySelector('[data-fv-error]');
        if (!p) return;

        // Si era el hint original del componente, lo restauramos
        if (p.hasAttribute('data-fv-original')) {
            p.className   = 'absolute bottom-0 label'; // clase original del blade
            p.textContent = p.getAttribute('data-fv-original');
            p.removeAttribute('data-fv-error');
            p.removeAttribute('data-fv-original');
        } else {
            p.remove();
        }
    }

    // ── Eventos ──────────────────────────────────────────────────────────────

    _bindSubmit() {
        const fn = (e) => {
            e.preventDefault();
            const isValid = this.validate();
            if (this._opts.onSubmit) {
                this._opts.onSubmit(this._form, isValid);
            }
        };
        this._form.addEventListener('submit', fn);
        this._listeners.push({ el: this._form, type: 'submit', fn });
    }

    /**
     * Escucha cambios en cada campo para revalidar en tiempo real.
     * Compatible con inputs nativos y con el Select custom (change en el
     * <select> nativo oculto).
     */
    _bindChangeListeners() {
        const fields = this._collectFields();

        for (const field of fields) {
            const targets = this._getChangeTargets(field);
            const eventType = ['radio', 'checkbox', 'checkbox-group', 'select', 'custom-select'].includes(field.type)
                ? 'change'
                : 'input';

            for (const target of targets) {
                const fn = () => this._validateField(field);
                target.addEventListener(eventType, fn);
                this._listeners.push({ el: target, type: eventType, fn });
            }
        }
    }

    /** Devuelve los elementos DOM que deben escuchar el evento de cambio. */
    _getChangeTargets(field) {
        switch (field.type) {
            case 'custom-select': return [field.native].filter(Boolean);
            case 'radio':
            case 'checkbox-group': return field.group;
            case 'checkbox':
            case 'select':        return [field.el];
            case 'textarea':
            case 'input':         return [field.el];
            default:              return [];
        }
    }

    // ── Utilidades ───────────────────────────────────────────────────────────

    /**
     * Recupera la instancia de Select asociada a un wrapper.
     * Busca en Select.instances si el módulo está disponible globalmente.
     */
    _getSelectInstance(wrapper) {
        // Soporte para import del módulo select.js
        if (typeof Select !== 'undefined' && Array.isArray(Select.instances)) {
            return Select.instances.find(inst => inst._container === wrapper) ?? null;
        }
        // Soporte para instancia guardada en el DOM (patrón alternativo)
        return wrapper._selectInstance ?? null;
    }

    _isEmail(val) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    }

    _isUrl(val) {
        try { new URL(val); return true; } catch { return false; }
    }
}

// ─── Auto-init ────────────────────────────────────────────────────────────────
// Permite inicializar sin escribir JS: agrega data-validate al <form>.
//
//   <form data-validate>...</form>
//
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('form[data-validate]').forEach(form => {
        new FormValidator(form, {
            onSubmit: (f, isValid) => {
                if (isValid) f.submit();
            },
        });
    });
});