// index-core.js - Cerebro del Command Center (V17)
// Adaptado para incluir todos los módulos del sistema

const CommandCenter = (function() {
    // ==========================================================================
    // 1. ESTADO PRIVADO
    // ==========================================================================
    let listeners = [];

    // ==========================================================================
    // 2. INICIALIZACIÓN
    // ==========================================================================
    function init() {
        _initUI();
        _bindEvents();
        _startListeners();
        _initClock();
    }

    // ==========================================================================
    // 3. CONFIGURACIÓN UI
    // ==========================================================================
    function _initUI() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            document.body.setAttribute('data-theme', 'light');
            document.getElementById('themeBtn').innerHTML = '🌙';
        } else {
            document.body.setAttribute('data-theme', 'dark');
            document.getElementById('themeBtn').innerHTML = '☀️';
        }
    }

    function _bindEvents() {
        document.getElementById('toggleMenuBtn').addEventListener('click', _toggleMenu);
        document.getElementById('themeBtn').addEventListener('click', _toggleTheme);
    }

    function _toggleMenu() {
        document.body.classList.toggle('sidebar-closed');
    }

    function _toggleTheme() {
        const body = document.body;
        const btn = document.getElementById('themeBtn');
        if (body.getAttribute('data-theme') === 'dark') {
            body.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            btn.innerHTML = '🌙';
        } else {
            body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            btn.innerHTML = '☀️';
        }
    }

    function _initClock() {
        const clockEl = document.getElementById('clock');
        setInterval(() => {
            clockEl.innerText = new Date().toLocaleTimeString();
        }, 1000);
    }

    // ==========================================================================
    // 4. LISTENERS FIRESTORE (KPIS + FEED)
    // ==========================================================================
    function _startListeners() {
        if (!window.db) return;

        // --- KPI 1: Ventas del Mes (ventas pagadas del mes actual) ---
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const unsubVentas = window.db.collection('ventas')
            .where('estatusPago', '==', 'Pagado')
            .where('fechaPago', '>=', startOfMonth)
            .where('fechaPago', '<=', endOfMonth)
            .onSnapshot(snap => {
                let total = 0;
                snap.forEach(doc => total += parseFloat(doc.data().total) || 0);
                document.getElementById('kpiVentasMes').innerText = _fmt(total);
            }, console.error);
        listeners.push(unsubVentas);

        // --- KPI 2: Tareas Taller (órdenes en laboratorio + motores) ---
        const estadosPendientes = ['pendiente', 'diagnóstico', 'diagnostico', 'Pendiente', 'Diagnóstico', 'Nuevo', 'En Espera', 'Reparado'];
        
        async function _actualizarTareasTaller() {
            try {
                const [taller, motores] = await Promise.all([
                    window.db.collection('ordenes_taller').where('estado', 'in', estadosPendientes).get(),
                    window.db.collection('ordenes_motores').where('estado', 'in', estadosPendientes).get()
                ]);
                document.getElementById('kpiTareasTaller').innerText = taller.size + motores.size;
            } catch (e) {
                console.error(e);
            }
        }

        const unsubTaller = window.db.collection('ordenes_taller')
            .where('estado', 'in', estadosPendientes)
            .onSnapshot(_actualizarTareasTaller, console.error);
        listeners.push(unsubTaller);

        const unsubMotores = window.db.collection('ordenes_motores')
            .where('estado', 'in', estadosPendientes)
            .onSnapshot(_actualizarTareasTaller, console.error);
        listeners.push(unsubMotores);

        // --- KPI 3: Valor Inventario (suma stock * costo) ---
        const unsubInventario = window.db.collection('inventario')
            .onSnapshot(snap => {
                let total = 0;
                snap.forEach(doc => {
                    const d = doc.data();
                    total += (parseFloat(d.stock) || 0) * (parseFloat(d.costo) || 0);
                });
                document.getElementById('kpiValorInventario').innerText = _fmt(total);
            }, console.error);
        listeners.push(unsubInventario);

        // --- KPI 4: Compras Pendientes (no recibidas) ---
        const unsubCompras = window.db.collection('compras')
            .where('estado', '<', 4)
            .onSnapshot(snap => {
                document.getElementById('kpiComprasPendientes').innerText = snap.size;
            }, console.error);
        listeners.push(unsubCompras);

        // --- FEED DE AUDITORÍA (últimos 10 movimientos) ---
        _startFeed();
    }

    // ==========================================================================
    // 5. FEED UNIFICADO (TODOS LOS MÓDULOS)
    // ==========================================================================
    function _startFeed() {
        const feedList = document.getElementById('feedList');
        const feedBadge = document.getElementById('feedBadge');
        let allEvents = [];

        function addEvent(origen, data, timestamp, dotClass) {
            let fecha = timestamp?.toDate ? timestamp.toDate() : (timestamp ? new Date(timestamp) : new Date());
            allEvents.push({ fecha, origen, data, dotClass });
            allEvents.sort((a,b) => b.fecha - a.fecha);
            allEvents = allEvents.slice(0, 15);
            renderFeed();
        }

        function renderFeed() {
            feedList.innerHTML = '';
            feedBadge.innerText = allEvents.length;
            allEvents.forEach(ev => {
                const item = document.createElement('div');
                item.className = 'feed-item';
                let dotClass = ev.dotClass || 'dot-ventas';
                let texto = '';
                if (ev.data.folio) texto = `Folio ${ev.data.folio}`;
                else if (ev.data.cliente) texto = `Cliente: ${ev.data.cliente}`;
                else if (ev.data.proveedor) texto = `Proveedor: ${ev.data.proveedor}`;
                else if (ev.data.nombre) texto = ev.data.nombre;
                else if (ev.data.titulo) texto = ev.data.titulo;
                else if (ev.data.equipo) texto = `Equipo: ${ev.data.equipo}`;
                else if (ev.data.motor) texto = `Motor: ${ev.data.motor}`;
                
                const monto = ev.data.total ? ` $${ev.data.total.toLocaleString()}` : '';
                item.innerHTML = `
                    <div class="feed-dot ${dotClass}"></div>
                    <div class="feed-meta"><span>${ev.origen}</span><span>${ev.fecha.toLocaleTimeString()}</span></div>
                    <div class="feed-body"><strong>${texto}</strong>${monto}</div>
                `;
                feedList.appendChild(item);
            });
        }

        // Ventas
        window.db.collection('ventas').orderBy('fechaCreacion', 'desc').limit(5).onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    addEvent('VENTAS', change.doc.data(), change.doc.data().fechaCreacion, 'dot-ventas');
                }
            });
        });

        // Compras
        window.db.collection('compras').orderBy('fechaCreacion', 'desc').limit(5).onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    addEvent('COMPRAS', change.doc.data(), change.doc.data().fechaCreacion, 'dot-compras');
                }
            });
        });

        // Laboratorio Electrónica
        window.db.collection('ordenes_taller').orderBy('fechaIngreso', 'desc').limit(5).onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    addEvent('LABORATORIO', change.doc.data(), change.doc.data().fechaIngreso, 'dot-taller');
                }
            });
        });

        // Taller Motores
        window.db.collection('ordenes_motores').orderBy('fecha_ingreso', 'desc').limit(5).onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    addEvent('MOTORES', change.doc.data(), change.doc.data().fecha_ingreso, 'dot-motores');
                }
            });
        });

        // Proyectos Generales
        window.db.collection('proyectos_generales').orderBy('fechaCreacion', 'desc').limit(5).onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    addEvent('PROYECTOS', change.doc.data(), change.doc.data().fechaCreacion, 'dot-proyectos');
                }
            });
        });

        // Automatización
        window.db.collection('proyectos_automatizacion').orderBy('fechaCreacion', 'desc').limit(5).onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    addEvent('AUTOMATIZACIÓN', change.doc.data(), change.doc.data().fechaCreacion, 'dot-automatizacion');
                }
            });
        });

        // Facturación
        window.db.collection('ventas').where('facturado', '==', true).orderBy('fechaFactura', 'desc').limit(5).onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    addEvent('FACTURACIÓN', change.doc.data(), change.doc.data().fechaFactura, 'dot-facturacion');
                }
            });
        });

        // Contactos (nuevos contactos)
        window.db.collection('contactos').orderBy('createdAt', 'desc').limit(5).onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    addEvent('CONTACTOS', change.doc.data(), change.doc.data().createdAt, 'dot-web');
                }
            });
        });
    }

    // ==========================================================================
    // 6. UTILIDADES
    // ==========================================================================
    function _fmt(n) {
        return '$' + parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // ==========================================================================
    // 7. LIMPIEZA
    // ==========================================================================
    function _cleanup() {
        listeners.forEach(unsub => unsub && unsub());
    }
    window.addEventListener('beforeunload', _cleanup);

    // ==========================================================================
    // 8. EXPOSICIÓN PÚBLICA
    // ==========================================================================
    return {
        init: init
    };
})();

window.CommandCenter = CommandCenter;