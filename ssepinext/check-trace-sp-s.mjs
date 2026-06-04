import { getDb } from './db.mjs';
const db = await getDb();
const q = (sql) => {
  const r = db.exec(sql);
  return r[0]?.values || [];
};
for (const [label, sql] of [
  ['cot SP-S', "SELECT id, json_extract(data,'$.folio'), json_extract(data,'$.cliente'), json_extract(data,'$.estado'), json_extract(data,'$.origen') FROM local_cotizaciones WHERE json_extract(data,'$.folio') LIKE 'SP-S%' LIMIT 10"],
  ['cot ECOBOLSAS', "SELECT id, json_extract(data,'$.folio'), json_extract(data,'$.cliente'), json_extract(data,'$.estado') FROM local_cotizaciones WHERE json_extract(data,'$.cliente') LIKE '%ECOBOLSAS%' OR json_extract(data,'$.cliente_nombre') LIKE '%ECOBOLSAS%' LIMIT 10"],
  ['compras TRACE', "SELECT id, json_extract(data,'$.folio'), json_extract(data,'$.vinculacion') FROM local_compras WHERE data LIKE '%TRACE%' LIMIT 10"],
  ['taller TRACE', "SELECT id, json_extract(data,'$.folio'), json_extract(data,'$.cliente_nombre') FROM local_ordenes_taller WHERE data LIKE '%TRACE%' LIMIT 10"],
]) {
  console.log('---', label);
  q(sql).forEach((v) => console.log(v));
}
