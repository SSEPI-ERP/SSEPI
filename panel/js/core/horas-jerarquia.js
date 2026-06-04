/**
 * Presupuesto de horas en árbol: servicio → subactividades → hijos.
 * El tiempo extra (real > plan) es interno y solo visible para admin.
 */
export function sumHorasPlanSubactividades(subs) {
    if (!Array.isArray(subs) || !subs.length) return 0;
    return subs.reduce((s, sub) => s + (Number(sub.horas_plan) || 0), 0);
}

export function cupoHorasPadre(padreNode, actividadRaiz) {
    if (padreNode && padreNode !== actividadRaiz) {
        return Number(padreNode.horas_plan) || 0;
    }
    return Number(actividadRaiz?.horas) || 0;
}

export function validarHorasPlan({ actividad, padreNode, nuevaHoras, subPath }) {
    const max = cupoHorasPadre(padreNode, actividad);
    if (max <= 0) {
        return { ok: false, mensaje: 'Defina primero las horas totales del servicio (oficina/planta).' };
    }
    const lista = padreNode === actividad ? (actividad.subactividades || []) : (padreNode.hijos || []);
    const idx = subPath != null ? parseInt(String(subPath).split('.').pop(), 10) : -1;
    let sumaOtros = 0;
    lista.forEach((sub, i) => {
        if (i === idx) return;
        sumaOtros += Number(sub.horas_plan) || 0;
    });
    const total = sumaOtros + (Number(nuevaHoras) || 0);
    if (total > max + 0.001) {
        return {
            ok: false,
            mensaje: `La suma de horas (${total.toFixed(1)} h) supera el cupo del nivel (${max} h).`
        };
    }
    return { ok: true, cupo: max, suma: total };
}

export function minutosRealesSub(sub) {
    if (sub.duracion_minutos > 0) return Number(sub.duracion_minutos);
    if (sub.inicio_at && sub.fin_at) {
        return Math.max(0, Math.round((new Date(sub.fin_at) - new Date(sub.inicio_at)) / 60000));
    }
    return 0;
}

export function calcularHorasExtraSub(sub) {
    const planMin = Math.round((Number(sub.horas_plan) || 0) * 60);
    const realMin = minutosRealesSub(sub);
    if (planMin <= 0 || realMin <= planMin) return 0;
    return (realMin - planMin) / 60;
}

export function aplicarHorasExtraEnSub(sub) {
    const extra = calcularHorasExtraSub(sub);
    if (extra > 0.01) {
        sub.horas_extra = Math.round(extra * 100) / 100;
        sub.tiene_horas_extra = true;
    } else {
        sub.horas_extra = 0;
        sub.tiene_horas_extra = false;
    }
    return sub.horas_extra;
}

/** Horas que cuentan para cotización (sin extra). */
export function horasParaCotizacionActividad(act) {
    const h = Number(act.horas) || 0;
    if (h > 0) return h;
    return sumHorasPlanSubactividades(act.subactividades);
}

if (typeof window !== 'undefined') {
    window.SSEPIHorasJerarquia = {
        sumHorasPlanSubactividades,
        cupoHorasPadre,
        validarHorasPlan,
        calcularHorasExtraSub,
        aplicarHorasExtraEnSub,
        horasParaCotizacionActividad,
        minutosRealesSub
    };
}
