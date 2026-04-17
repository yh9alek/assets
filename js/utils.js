window.obtenerShowPath = () => {
    return window.location.pathname.split('/').slice(0, -1).join('/');
};

window.refrescarSidebar = async function refrescarSidebar() {
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