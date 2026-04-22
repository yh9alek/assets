import axios from 'axios';
import Swal from 'sweetalert2';
import { getSwalTarget } from './sweet-alert2';
window.axios = axios;

window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

// Config base para trabajar con APIs
window.axios.defaults.withCredentials = true;
window.axios.defaults.baseURL = '/api';

// INTERCEPTORS
window.axios.interceptors.response.use(
    response => {
        const { status, config } = response;
        const method = config.method?.toUpperCase();

        if (status === 200 && ['PUT', 'PATCH'].includes(method)) {
            Swal.fire({
                icon: 'success',
                title: 'Se actualizó el registro correctamente',
                timer: 2000,
                showConfirmButton: true,
                heightAuto: false,
                target: getSwalTarget()
            });
        }

        if (status === 201) {
            Swal.fire({
                icon: 'success',
                title: 'Se registró correctamente',
                timer: 2000,
                showConfirmButton: true,
                heightAuto: false,
                target: getSwalTarget()
            });
        }

        if (status === 204) {
            Swal.fire({
                icon: 'success',
                title: 'Se eliminó el registro correctamente',
                timer: 2000,
                showConfirmButton: true,
                heightAuto: false,
                target: getSwalTarget()
            });
        }

        return response;
    },
    error => {
        if (!error.response) {
            Swal.fire({
                icon: 'error',
                title: 'Error de conexión',
                text: 'No se pudo conectar con el servidor. Verifica tu conexión.',
                showConfirmButton: true,
                allowOutsideClick: false,
                heightAuto: false,
                target: getSwalTarget()
            });
            return Promise.reject(error);
        }
        const { status, data } = error.response;

        const alerts = {
            400: {
                icon: 'warning',
                title: 'Solicitud incorrecta',
                text: data?.message || data?.msg || 'Solicitud no válida',
            },
            401: {
                icon: 'warning',
                title: 'Sin autorización',
            },
            403: {
                icon: 'error',
                title: 'Operación no permitida',
                text: 'No esta autorizado para realizar esta acción',
            },
            404: {
                icon: 'warning',
                title: 'No encontrado',
            },
            405: {
                icon: 'warning',
                title: 'Método no permitido',
                text: 'Favor de comunicar a soporte.',
            },
            422: {
                icon: 'warning',
                title: 'Revise su información',
                text: 'Los datos enviados son incorrectos.',
            },
            500: {
                icon: 'error',
                title: 'Error del servidor',
                text: 'Favor de comunicar a soporte',
            },
        };

        const alertConfig = alerts[status];

        if (alertConfig) {
            Swal.fire({
                showConfirmButton: true,
                allowOutsideClick: false,
                heightAuto: false,
                ...alertConfig,
                target: getSwalTarget()
            });
        }

        return Promise.reject(error);
    }
);