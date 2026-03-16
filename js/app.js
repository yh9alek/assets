import './bootstrap';

import Alpine from 'alpinejs';

window.Alpine = Alpine;

Alpine.start();


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