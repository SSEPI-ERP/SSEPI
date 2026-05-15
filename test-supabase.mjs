import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://foytizbicwnndegeorny.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZveXRpemJpY3dubmRlZ2Vvcm55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTYwMjIsImV4cCI6MjA5MTc3MjAyMn0.7zV20r9XDCxcn-bTg9k1Q9Kj7hhhDffRtAWG8JDikLo';

const sb = createClient(SUPABASE_URL, ANON_KEY);

async function test() {
    console.log('Testing Supabase project:', SUPABASE_URL);
    const { data: tabData, error: tabError } = await sb
        .from('clientes_tabulador')
        .select('cliente_nombre, km_ida, horas_invertidas, activo')
        .limit(5);
    console.log('clientes_tabulador:', tabData?.length ?? 0, 'rows', tabError ? 'ERROR:'+tabError.message : 'OK');
    if (tabData && tabData.length > 0) {
        console.log('First row:', JSON.stringify(tabData[0]));
    }

    const { data: paramData, error: paramError } = await sb
        .from('parametros_costos')
        .select('clave, valor, departamento')
        .limit(10);
    console.log('parametros_costos:', paramData?.length ?? 0, 'rows', paramError ? 'ERROR:'+paramError.message : 'OK');
    if (paramData) console.log(JSON.stringify(paramData));

    const { data: polData, error: polError } = await sb
        .from('politicas_modulos')
        .select('modulo, titulo')
        .limit(5);
    console.log('politicas_modulos:', polData?.length ?? 0, 'rows', polError ? 'ERROR:'+polError.message : 'OK');
}

test().catch(e => console.error(e));
