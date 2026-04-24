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
        const key = `${departamentoActual}_${clave}`;
        return CONFIG[key] !== undefined ? CONFIG[key] : valorPorDefecto;
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

    // ==================== CARGA DESDE BD ====================
    function applyConfig(partial) {
        if (!partial || typeof partial !== 'object') return;
        Object.assign(CONFIG, partial);
    }

    async function loadFromDatabase(departamento = 'laboratorio') {
        departamentoActual = departamento;
        try {
            if (!window.supabase) return CONFIG;
            const { data, error } = await window.supabase
                .from('parametros_costos')
                .select('clave, valor, departamento')
                .eq('activo', true);
            if (error || !data) return CONFIG;

            const params = {};
            data.forEach(p => {
                params[`${p.departamento}_${p.clave}`] = Number(p.valor);
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
        calcularAutomatizacion
    };
})();

window.CostosEngine = CostosEngine;
