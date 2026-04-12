import './bootstrap';

import Alpine from 'alpinejs';
import { Grid } from './grid.js';
import { Select } from './select.js';
import { FormValidator } from './form-validator.js';

import './utils.js';
import './sweet-alert2.js';

window.Alpine = Alpine;
Alpine.start();

window.Grid = Grid;
window.Select = Select;
window.FormValidator = FormValidator;

// Estado del tema actual
document.addEventListener('DOMContentLoaded', () => {

    const savedTheme   = localStorage.getItem('theme') || 'tailwind';
    const defaultTheme = 'tailwind';

    // 1. Sincronizar el estado visual de cada checkbox/radio al cargar la página
    document.querySelectorAll('.theme-controller').forEach(controller => {
        if (controller.type === 'checkbox') {
            const isDark = (controller.value === savedTheme);
            controller.checked = isDark;
        } else if (controller.type === 'radio') {
            controller.checked = (controller.value === savedTheme);
        }
    });

    // 2. Listener de cambios
    document.addEventListener('change', (e) => {
        const controller = e.target.closest('.theme-controller');
        if (!controller) return;

        let newTheme;

        if (controller.type === 'checkbox') {
            newTheme = controller.checked
                ? controller.value
                : (controller.dataset.default ?? defaultTheme);
        } else if (controller.type === 'radio' && controller.checked) {
            newTheme = controller.value;
        }

        if (newTheme) {
            
            // Guardar en persistencia
            localStorage.setItem('theme', newTheme);
            
            // Actualizar el DOM inmediatamente para que haga el cambio visual
            document.documentElement.setAttribute('data-theme', newTheme);

            // 3. Sincronizar el estado del OTRO botón (móvil o escritorio)
            document.querySelectorAll('.theme-controller').forEach(other => {
                if (other !== controller) {
                    if (other.type === 'checkbox') {
                        other.checked = controller.checked;
                    } else if (other.type === 'radio') {
                        other.checked = (other.value === newTheme);
                    }
                }
            });
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    
    // Buscar todos los modales de la página
    const modals = document.querySelectorAll('dialog');

    modals.forEach(modal => {
        modal.addEventListener('close', () => {
            
            // Buscar formularios dentro del modal, 
            // ignorando el propio form de cierre nativo (<form method="dialog">)
            const forms = modal.querySelectorAll('form:not([method="dialog"])');

            forms.forEach(form => {
                // 1. Resetea los valores de los inputs nativos
                // Al hacer esto, el navegador dispara el evento 'reset', 
                // el cual tu componente Select YA está escuchando para limpiarse solo.
                form.reset();

                // 2. Limpia los mensajes y bordes rojos de validación
                if (form._formValidator) {
                    form._formValidator.reset();
                }
            });
            
        });
    });

});