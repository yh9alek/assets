import { Grid } from '../grid.js';

new Grid('#tabla-usuarios', '/usuarios/data', {
    serverSide: true,
    rowsPerPage: 8,
    columns: [
        { key: 'name',  label: 'Nombre' },
        { 
            key: 'email', label: 'Correo', 
            render: (row) => `
                <div class="alert alert-warning px-4 py-2">${row.email}</div>
            `
        },
        {
            key: 'actions',
            label: '...',
            render: (row) => [
                `<button title="Editar" class="grid-button grid place-items-center h-7.5 tooltip" data-tip="Editar">
                    <span class="material-symbols-rounded color-base-content" style="font-size:18px;">
                        edit_note
                    </span>
                </button>`,
                `<button title="Eliminar" class="grid-button grid place-items-center h-7.5 tooltip" data-tip="Eliminar">
                    <span class="material-symbols-rounded" style="color:#FF6B6B; font-size:18px;">
                        cancel
                    </span>
                </button>`,
                `<button title="Info." class="grid-button grid place-items-center h-7.5 tooltip" data-tip="Info.">
                    <span class="material-symbols-rounded" style="color:#4A90D9; font-size:18px;">
                        info
                    </span>
                </button>`,
            ]
        }
    ],
});