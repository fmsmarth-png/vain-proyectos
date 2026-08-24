// Claves de sessionStorage compartidas del flujo de Post Venta.
//
// Vive en su propio archivo (y no dentro de PostVenta.tsx) a propósito: un
// archivo que exporta un componente de página como default NO debería
// exportar además valores sueltos. Eso viola la regla de Fast Refresh de
// Vite/React ("un archivo con componentes debe exportar solo componentes") y
// puede hacer que la navegación hacia esa página falle en silencio cuando
// otro archivo importa ese valor suelto — la URL cambia (history.push ya
// corrió) pero la página nunca llega a pintarse.
//
// Es el id de borrador (postventa_papeletas.id) que PostVenta.tsx debe
// reanudar al montar. Lo setean tanto DetalleDepto (al reabrir una visita en
// progreso) como CalendarioPostVenta (al crear una papeleta nueva desde el
// botón "Subir papeleta").
export const RESUME_KEY = 'postventa_papeleta_id';
