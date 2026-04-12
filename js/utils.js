window.obtenerShowPath = () => {
    return window.location.pathname.split('/').slice(0, -1).join('/');
};