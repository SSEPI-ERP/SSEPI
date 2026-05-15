// ================================================
// ARCHIVO: costos-engine.js
// DESCRIPCIÓN: Motor de cálculo financiero unificado
// TODOS LOS VALORES SE CARGAN DESDE BD (parametros_costos)
// ================================================

export const CostosEngine = (function() {
    let CONFIG = {};
    let departamentoActual = 'laboratorio';

    // ==================== FÓRMULAS BASE ====================
    function getParam(clave, valorPorDefecto) {
        const deptKey = `${departamentoActual}_${clave}`;
        if (CONFIG[deptKey] !== undefined) return CONFIG[deptKey];
        const generalKey = `general_${clave}`;
        if (CONFIG[generalKey] !== undefined) return CONFIG[generalKey];
        return valorPorDefecto;
    }

    function calcularLitros(km) {
        const rendimiento = getParam('rendimiento_km_litro', 10);
        return km <= 0 ? 0 : (km * 2) / rendimiento;
    }

    function calcularCostoGasolina(km) {
        const litros = calcularLitros(km);
        const precio = getParam('gasolina_precio_litro', 30);
        return litros * precio;
    }

    function calcularCostoVentas(dias) {
        const tarifa = getParam('ventas_por_dia', 87);
        return dias * tarifa;
    }

    function calcularCostoTrasladoTecnico(horasViaje) {
        const tarifa = getParam('tiempo_invertido_hr', 80);
        return horasViaje * tarifa;
    }

    function calcularGastosFijos(horasTaller) {
        const tarifa = getParam('gastos_fijos_hr', 161.85);
        return horasTaller * tarifa;
    }

    function calcularCostoCamioneta(horasViaje) {
        const tarifa = getParam('camioneta_hr', 52.67);
        return horasViaje * tarifa;
    }

    function calcularGasolinaMasTraslado(km, horasViaje) {
        return calcularCostoGasolina(km) + calcularCostoTrasladoTecnico(horasViaje);
    }

    function calcularManoObra(horasTaller) {
        const tarifa = getParam('mano_obra_hr', 0);
        return horasTaller * tarifa;
    }

    function calcularGastosGenerales(gasolinaMasTraslado, manoObra, gastosFijos, refacciones, camioneta) {
        return gasolinaMasTraslado + manoObra + gastosFijos + refacciones + camioneta;
    }

    function aplicarUtilidad(gastosGenerales, factor) {
        if (factor) return gastosGenerales * factor;
        const utilidadBase = getParam('utilidad_base', 40);
        const utilidadPremium = getParam('utilidad_premium', 45);
        const factorDefault = 1 + (utilidadBase / 100);
        return gastosGenerales * factorDefault;
    }

    function aplicarCredito(precioConUtilidad) {
        const credito = getParam('credito_pct', 3);
        return precioConUtilidad * (1 + credito / 100);
    }

    function calcularIVA(monto) {
        const iva = CONFIG['iva'] || 16;
        return monto * (iva / 100);
    }

    function calcularTotalConIVA(montoBase) {
        const iva = CONFIG['iva'] || 16;
        return montoBase * (1 + iva / 100);
    }

    function calcularPrecioFinal({ km, horasViaje, horasTaller, costoRefacciones, utilidadFactor }) {
        const gasolinaMasTraslado = calcularGasolinaMasTraslado(km, horasViaje);
        const manoObra = calcularManoObra(horasTaller);
        const gastosFijos = calcularGastosFijos(horasTaller);
        const camioneta = calcularCostoCamioneta(horasViaje);

        const gastosGenerales = calcularGastosGenerales(
            gasolinaMasTraslado,
            manoObra,
            gastosFijos,
            costoRefacciones,
            camioneta
        );

        const precioConUtilidad = aplicarUtilidad(gastosGenerales, utilidadFactor);
        const precioAntesIVA = aplicarCredito(precioConUtilidad);
        const iva = calcularIVA(precioAntesIVA);
        const totalConIVA = calcularTotalConIVA(precioAntesIVA);

        return {
            gasolina: calcularCostoGasolina(km),
            trasladoTecnico: calcularCostoTrasladoTecnico(horasViaje),
            gasolinaMasTraslado,
            manoObra,
            gastosFijos,
            camioneta,
            refacciones: costoRefacciones,
            gastosGenerales,
            precioConUtilidad,
            precioAntesIVA,
            iva,
            total: totalConIVA
        };
    }

    // ==================== AUTOMATIZACIÓN (tarifas por servicio) ====================
    function calcularAutomatizacion(servicios, km, horasInvestigacion, materiales, viaticos) {
        const tarifas = {
            plc_hmi: getParam('plc_hmi_hr', 650),
            servomotor: getParam('servomotor_hr', 700),
            diseno_tablero: getParam('diseno_tablero_hr', 450),
            diseno_mecanico: getParam('diseno_mecanico_hr', 900),
            instalacion: getParam('instalacion_hr', 350),
            fabricacion: getParam('fabricacion_hr', 600),
            soporte: getParam('soporte_hr', 1100),
            arquitectura: getParam('arquitectura_hr', 150)
        };

        const tiempoPlanta = Object.values(servicios).reduce((a, b) => a + b, 0);
        let totalServicios = 0;

        totalServicios += (servicios.plc_hmi || 0) * tarifas.plc_hmi;
        totalServicios += (servicios.servomotor || 0) * tarifas.servomotor;
        totalServicios += (servicios.diseno_tablero || 0) * tarifas.diseno_tablero;
        totalServicios += (servicios.diseno_mecanico || 0) * tarifas.diseno_mecanico;
        totalServicios += (servicios.instalacion || 0) * tarifas.instalacion;
        totalServicios += (servicios.fabricacion || 0) * tarifas.fabricacion;
        totalServicios += (servicios.soporte || 0) * tarifas.soporte;
        totalServicios += (servicios.arquitectura || 0) * tarifas.arquitectura;

        const materialesCon30 = (materiales || 0) * 1.3;
        const camioneta = tiempoPlanta * getParam('camioneta_hr', 52.67);
        const gasolina = calcularCostoGasolina(km);
        const gastosInvestigacion = (horasInvestigacion || 0) * getParam('gastos_fijos_hr', 161.85);

        const subtotal = totalServicios + materialesCon30 + (materiales || 0) + (viaticos || 0) + camioneta + gasolina + gastosInvestigacion;
        const credito = subtotal * 0.03;
        const total = subtotal + credito;
        const descuento = total * 0.05;

        return {
            tiempoPlanta,
            totalServicios,
            materiales,
            materialesCon30,
            viaticos: viaticos || 0,
            camioneta,
            gasolina,
            gastosInvestigacion,
            subtotal,
            credito,
            total,
            descuento
        };
    }

    // ==================== LABORATORIO (Hoja Excel: LABORATORIO) ====================
    function calcularLaboratorio(dias, km, horasInvertido, refacciones, utilidadFactor) {
        const gasolinaPrecio = getParam('gasolina_precio_litro', 30);
        const rendimiento = getParam('rendimiento_km_litro', 10);
        const ventasPorDia = getParam('ventas_por_dia', 87);
        const tiempoInvertidoHr = getParam('tiempo_invertido_hr', 80);
        const gastosFijosHr = getParam('gastos_fijos_hr', 161.85);
        const camionetaHr = getParam('camioneta_hr', 52.67);

        const gasolina = ((km * 2) / rendimiento) * gasolinaPrecio;
        const ventas = dias * ventasPorDia;
        const totalGasVentas = gasolina + ventas;
        const totalTiempoInvertido = horasInvertido * tiempoInvertidoHr;
        const gastosFijos = horasInvertido * gastosFijosHr;
        const camioneta = dias * camionetaHr;
        const gastosGenerales = totalGasVentas + totalTiempoInvertido + gastosFijos + (refacciones || 0) + camioneta;
        const factor = utilidadFactor || 1.4;
        const utilidad = gastosGenerales * factor;
        const credito = utilidad * 1.03;

        return {
            dias,
            km,
            gasolina,
            ventas,
            totalGasVentas,
            horasInvertido,
            totalTiempoInvertido,
            gastosFijos,
            refacciones: refacciones || 0,
            camioneta,
            gastosGenerales,
            utilidad,
            credito
        };
    }

    // ==================== MOTORES (Hoja Excel: MOTORES) ====================
    function calcularMotores(dias, km, becerra, utilidadFactor) {
        const gasolinaPrecio = getParam('gasolina_precio_litro', 30);
        const rendimiento = getParam('rendimiento_km_litro', 10);
        const ventasPorDia = getParam('ventas_por_dia', 87);
        const camionetaHr = getParam('camioneta_hr', 52.67);

        const gasolina = ((km * 2) / rendimiento) * gasolinaPrecio;
        const ventas = dias * ventasPorDia;
        const totalGasVentas = gasolina + ventas;
        const camioneta = dias * camionetaHr;
        const gastosSU = totalGasVentas + (becerra || 0) + camioneta;
        const factor = utilidadFactor || 1.4;
        const utilidad = gastosSU * factor;
        const credito = utilidad * 1.03;

        return {
            dias,
            km,
            gasolina,
            ventas,
            totalGasVentas,
            becerra: becerra || 0,
            camioneta,
            gastosSU,
            utilidad,
            credito
        };
    }

    // ==================== SUMINISTROS (Hoja Excel: SUMINISTROS) ====================
    function calcularSuministros(dias, km, proveedor, utilidadFactor) {
        // Misma fórmula que MOTORES pero con PROVEEDOR en vez de BECERRA
        const gasolinaPrecio = getParam('gasolina_precio_litro', 30);
        const rendimiento = getParam('rendimiento_km_litro', 10);
        const ventasPorDia = getParam('ventas_por_dia', 87);
        const camionetaHr = getParam('camioneta_hr', 52.67);

        const gasolina = ((km * 2) / rendimiento) * gasolinaPrecio;
        const ventas = dias * ventasPorDia;
        const totalGasVentas = gasolina + ventas;
        const camioneta = dias * camionetaHr;
        const gastosSU = totalGasVentas + (proveedor || 0) + camioneta;
        const factor = utilidadFactor || 1.4;
        const utilidad = gastosSU * factor;
        const credito = utilidad * 1.03;

        return {
            dias,
            km,
            gasolina,
            ventas,
            totalGasVentas,
            proveedor: proveedor || 0,
            camioneta,
            gastosSU,
            utilidad,
            credito
        };
    }

    // ==================== RENTABILIDAD Y ADEUDOS ====================
    function calcularCostoRealLaboratorio(data) {
        const base = Number(data.costo_total) || 0;
        const extras = (data.componentes_extras || []).reduce((s, i) => s + (Number(i.subtotal) || 0), 0);
        const consumibles = (data.consumibles_usados || []).reduce((s, i) => s + (Number(i.costo) || 0), 0);
        const refaccionesInv = (data.refacciones_inventario || []).reduce((s, i) => s + (Number(i.costo) || 0) * (Number(i.cantidad) || 1), 0);
        const refaccionesEnlaces = (data.refacciones_enlaces || []).reduce((s, i) => s + (Number(i.costo_estimado) || 0), 0);
        return base + extras + consumibles + refaccionesInv + refaccionesEnlaces;
    }

    function calcularCostoRealMotores(data) {
        const base = Number(data.costo_total) || 0;
        const refacciones = Number(data.refacciones) || 0;
        const consumibles = (data.consumibles_usados || []).reduce((s, i) => s + (Number(i.costo) || 0), 0);
        const refaccionesInv = (data.refacciones_inventario || []).reduce((s, i) => s + (Number(i.costo) || 0) * (Number(i.cantidad) || 1), 0);
        return base + refacciones + consumibles + refaccionesInv;
    }

    function calcularCostoRealAutomatizacion(data) {
        const materiales = Number(data.costo_materiales) || 0;
        const actividades = (data.actividades || []).reduce((s, i) => s + (Number(i.horas) || 0) * (Number(i.tarifa) || 0), 0);
        const gasolina = Number(data.costo_gasolina) || 0;
        const camioneta = Number(data.costo_camioneta) || 0;
        const viaticos = Number(data.costo_viaticos) || 0;
        return materiales + actividades + gasolina + camioneta + viaticos;
    }

    function determinarRentabilidad(costoPresupuestado, costoReal) {
        const pres = Number(costoPresupuestado) || 0;
        const real = Number(costoReal) || 0;
        return real > pres ? 'rojo' : 'verde';
    }

    // ==================== CARGA DESDE BD ====================
    function applyConfig(partial) {
        if (!partial || typeof partial !== 'object') return;
        Object.assign(CONFIG, partial);
    }

    async function loadFromDatabase(departamento = 'laboratorio') {
        departamentoActual = departamento;
        try {
            if (!window.supabase) return CONFIG;
            let data, error;
            try {
                // Intentar con columnas nuevas (departamento, activo)
                const res = await window.supabase
                    .from('parametros_costos')
                    .select('clave, valor, departamento')
                    .eq('activo', true);
                data = res.data;
                error = res.error;
            } catch (e) {
                error = e;
            }
            // Fallback si falla (columnas no existen aún)
            if (error || !data) {
                try {
                    const res2 = await window.supabase
                        .from('parametros_costos')
                        .select('clave, valor');
                    data = res2.data;
                    error = res2.error;
                } catch (e2) {
                    return CONFIG;
                }
            }
            if (error || !data) return CONFIG;

            const params = {};
            // Normaliza claves cortas (usadas en SQL/BD) a las claves largas internas
            const normalizeKey = {
                'gasolina': 'gasolina_precio_litro',
                'rendimiento': 'rendimiento_km_litro',
                'costo_tecnico': 'tiempo_invertido_hr',
                'gastos_fijos_hora': 'gastos_fijos_hr',
                'camioneta_hora': 'camioneta_hr',
                'mano_obra_hr': 'mano_obra_hr',
                'utilidad_base': 'utilidad_base',
                'utilidad_premium': 'utilidad_premium',
                'credito_pct': 'credito_pct',
                'iva': 'iva'
            };
            const keyMap = {
                'gasolina_precio_litro': 'gasolina',
                'rendimiento_km_litro': 'rendimiento',
                'tiempo_invertido_hr': 'costoTecnico',
                'gastos_fijos_hr': 'gastosFijosHora',
                'camioneta_hr': 'camionetaHora',
                'mano_obra_hr': 'manoObraHr',
                'utilidad_base': 'utilidad',
                'utilidad_premium': 'utilidad',
                'credito_pct': 'credito',
                'iva': 'iva'
            };
            data.forEach(p => {
                const prefix = p.departamento || 'general';
                const normalized = normalizeKey[p.clave] || p.clave;
                params[`${prefix}_${normalized}`] = Number(p.valor);
                // Alias sin prefijo para compatibilidad con ventas.js
                const alias = keyMap[normalized];
                if (alias) params[alias] = Number(p.valor);
            });
            applyConfig(params);
            return CONFIG;
        } catch (e) {
            console.warn('[CostosEngine] Error cargando desde BD:', e);
            return CONFIG;
        }
    }

    function setDepartamento(departamento) {
        departamentoActual = departamento;
    }

    function getDepartamento() {
        return departamentoActual;
    }

    function getConfig() {
        return CONFIG;
    }

    // ==================== API PÚBLICA ====================
    return {
        calcularCostoRealLaboratorio,
        calcularCostoRealMotores,
        calcularCostoRealAutomatizacion,
        determinarRentabilidad,
        loadFromDatabase,
        getConfig,
        applyConfig,
        setDepartamento,
        getDepartamento,
        calcularLitros,
        calcularCostoGasolina,
        calcularCostoVentas,
        calcularCostoTrasladoTecnico,
        calcularGastosFijos,
        calcularCostoCamioneta,
        calcularGasolinaMasTraslado,
        calcularManoObra,
        calcularGastosGenerales,
        aplicarUtilidad,
        aplicarCredito,
        calcularIVA,
        calcularTotalConIVA,
        calcularPrecioFinal,
        calcularAutomatizacion,
        calcularLaboratorio,
        calcularMotores,
        calcularSuministros
    };
})();

window.CostosEngine = CostosEngine;
