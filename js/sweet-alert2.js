import Swal from "sweetalert2";

export function getSwalTarget() {
    const modalesAbiertos = document.querySelectorAll('dialog[open]');
    if (modalesAbiertos.length > 0) {
        return modalesAbiertos[modalesAbiertos.length - 1];
    }
    return 'body';
}

const base = Swal.mixin({
    buttonsStyling: true,
    allowOutsideClick: false,
    scrollbarPadding: false,
    heightAuto: false,
});

const toast = Swal.mixin({
    toast: true,
    position: 'bottom-end',
    showConfirmButton: false,
    timer: 5000,
    timerProgressBar: true,
    scrollbarPadding: false,
});

window.mostrarLoader = () => {
    Swal.fire({
        title: 'Cargando...',
        allowOutsideClick: false,
        target: getSwalTarget(),
        didOpen: () => {
            Swal.showLoading();
        }
    });
};

window.cerrarLoader = () => {
    Swal.close();
};

/* ──────────────────────────────────────────────
    CONFIRMACIÓN — con botón cancelar
    ────────────────────────────────────────────── */
/**
 * Muestra un diálogo de confirmación.
 * @param {string} title
 * @param {string} text
 * @param {object} opts           - Opciones extra de Swal
 * @returns {Promise<boolean>}    - true si el usuario confirmó
 */
window.mostrarConfirmacion = async function confirm(title, text = '', opts = {}) {
    const result = await base.fire({
        icon: 'warning',
        title,
        text,
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        confirmButtonText: 'SI',
        target: getSwalTarget(),
        ...opts,
    });
    return result.isConfirmed;
};


/* ──────────────────────────────────────────────
    PROMPT — input de texto
    ────────────────────────────────────────────── */
/**
 * Muestra un diálogo con campo de texto.
 * @param {string} title
 * @param {string} placeholder
 * @param {object} opts
 * @returns {Promise<string|null>}  - valor ingresado, o null si canceló
 */
window.mostrarPrompt = async function prompt(title, placeholder = '', opts = {}) {
    const result = await base.fire({
        title,
        input: 'text',
        inputPlaceholder: placeholder,
        showCancelButton: true,
        confirmButtonText: 'Aceptar',
        cancelButtonText: 'Cancelar',
        target: getSwalTarget(),
        inputValidator: (value) => {
            if (!value?.trim()) return 'Este campo es obligatorio.';
        },
        ...opts,
    });
    return result.isConfirmed ? result.value : null;
}


function formatDate(iso) {
  if(!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(iso) {
  if(!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

window.mostrarInfo = function(row) {
  Swal.fire({
    target: getSwalTarget(),
    html: `
      <div style="padding: 20px 0 4px; font-family: Figtree, ui-sans-serif, system-ui, sans-serif;">

        <div style="display:flex;align-items:center;gap:12px;padding-bottom:16px;margin-bottom:16px;" class="border-b border-[#D1D5DC] dark:border-[#18181B]">
          <div style="width:42px;height:42px;border-radius:50%;background:oklch(0.623 0.214 259.815 / 0.12);display:flex;align-items:center;justify-content:center;">
            <span class="material-symbols-rounded" style="font-size:22px;color:oklch(0.623 0.214 259.815);">receipt_long</span>
          </div>
          <div>
            <p style="font-size:20px;font-weight:600;margin:0;color:var(--swal-title-color);">Información del registro</p>
          </div>
        </div>

        <p style="font-size:13px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--swal-body-color);margin:0 0 10px;">Registro</p>
        <div style="margin-bottom:14px;" class="pl-7 grid grid-cols-1 430:grid-cols-2">
          ${fieldCard('person_add', 'Usuario alta', row.usuario_alta ?? '', null, 'create')}
          ${fieldCard('calendar_add_on', 'Fecha de creación', formatDate(row.created_at), formatTime(row.created_at), 'create')}
        </div>

        <p style="font-size:13px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--swal-body-color);margin:0 0 10px;">Última modificación</p>
        <div class="pl-7 grid grid-cols-1 430:grid-cols-2">
          ${fieldCard('manage_accounts', 'Usuario modificación', row.usuario_mod ?? '', null, 'mod')}
          ${fieldCard('event_available', 'Fecha modificación', formatDate(row.updated_at), formatTime(row.updated_at), 'mod')}
        </div>

      </div>
    `,
    showConfirmButton: true,
    confirmButtonText: 'Cerrar',
    width: 420,
    allowOutsideClick: true,
    buttonsStyling: true,
    scrollbarPadding: false,
  });
}

function fieldCard(icon, label, value, sub = null, type = 'create') {
  const iconBg = type === 'create'
    ? 'oklch(0.623 0.214 259.815 / 0.10)'
    : 'oklch(0.696 0.17 162.48 / 0.12)';
  const iconColor = type === 'create'
    ? 'oklch(0.623 0.214 259.815)'
    : 'oklch(0.696 0.17 162.48)';

  return `
    <div style="border-radius:8px;padding:10px 0;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
        <div style="width:20px;height:20px;border-radius:5px;background:${iconBg};display:flex;align-items:center;flex-shrink:0;">
          <span class="material-symbols-rounded" style="font-size:13px;color:${iconColor};">${icon}</span>
        </div>
        <span style="font-size:12px;color:var(--swal-body-color);font-weight:500;text-align:left;">${label}</span>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-content:start;row-gap:0;font-size:13px;font-weight:500;color:var(--swal-title-color);text-align:left;max-width:150px;"><span>${value}</span> <span style="font-size:11px;color:var(--swal-body-color);margin-top:2px;">${sub ?? ''}</span> </div>
    </div>
  `;
}