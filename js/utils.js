window.obtenerShowPath = () => {
    return window.location.pathname.split('/').slice(0, -1).join('/');
};

window.refrescarSidebar = async () => {
    try {
        const response = await axios.get('/render-sidebar');
        
        const sidebarContenedor = document.getElementById('app-sidebar-container');
        
        if (sidebarContenedor) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = response.data;

            const nuevoSidebar = tempDiv.querySelector('#app-sidebar-container');
            if (nuevoSidebar) {
                sidebarContenedor.outerHTML = nuevoSidebar.outerHTML;
            }
        }
    } catch (error) {
        console.error('Error al recargar el sidebar:', error);
    }
}

/**
 * Carga los datos de un objeto plano en todos los campos de un formulario.
 * Compatible con inputs, selects, textareas, radios y checkboxes.
 *
 * @param {string | HTMLFormElement} form  - Selector o elemento del formulario
 * @param {object} data                    - Objeto con { name: value }
 */
window.cargarFormulario = (form, data) => {
  const el = typeof form === 'string' ? document.querySelector(form) : form;
  if (!el) return;

  for (const [name, value] of Object.entries(data)) {
    const fields = el.querySelectorAll(`[name="${name}"]`);

    for (const field of fields) {
      switch (field.type) {

        case 'checkbox':
          field.checked = Array.isArray(value)
            ? value.includes(field.value)
            : field.value === String(value);
          break;

        case 'radio':
          field.checked = field.value === String(value);
          break;

        default:
          field.value = value ?? '';

          // Dispara 'change' para que Select custom y otros reactive re-rendericen
          field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  // Limpia errores previos si el formulario tiene un FormValidator activo
  el._formValidator?.reset();
}