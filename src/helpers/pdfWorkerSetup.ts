/**
 * Configuración centralizada del worker de pdfjs-dist.
 *
 * Importar este módulo en cualquier helper que use pdfjs-dist para
 * garantizar que la versión del worker coincide con la de la API.
 *
 * Usar ?url le dice a Vite que empaquete el archivo del worker y
 * devuelva su URL final (hash incluido). Así la versión del worker
 * SIEMPRE es la misma que la del paquete instalado — no depende
 * de una copia manual en public/.
 */
import * as pdfjsLib from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

export { pdfjsLib };
