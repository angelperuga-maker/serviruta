# HANDOFF PARA CLAUDE — SERVIRUTA MANTENCIONES
Fecha: 24-10-2026

## Instrucción principal
Continúa el trabajo desde el `index.html` incluido en este paquete. Inspecciona primero el proyecto y las integraciones disponibles en tu entorno conectado. Conserva una copia antes de modificar. No afirmes que una función está conectada o publicada si no la probaste. Completa el sistema de punta a punta, sin detenerte por decisiones reversibles; pide confirmación solo para acciones irreversibles, publicación pública, gasto de dinero, compra de datos/licencias o credenciales que no existan.

## Contexto confirmado
- Marca: SERVIRUTA.
- Servicio: cambio de aceite y packs de mantenimiento a domicilio.
- Cobertura inicial: Santiago y Región Metropolitana; preparar expansión a regiones.
- Flujo: buscar vehículo por marca, modelo, año y motor → mostrar kits compatibles → cotizar o solicitar hora.
- Margen objetivo: 70% bruto sobre precio de venta. Fórmula orientativa: precio neto = costo directo total / 0,30. No confundir con recargo de 70%.
- Fuentes a investigar: Autoplanet Chile (aceites y productos para livianos), Implementos (filtros y vehículos de trabajo), MANN-FILTER y catálogos técnicos de aplicación/equivalencia de Estados Unidos.
- Referentes UX: https://www.autoplanet.cl/ ; https://usamobileoilchange.com/schedule/ ; https://www.yourmechanic.com/ ; https://mobilemechanicamerica.com/services/oil-change ; https://wrench.com/services/oil-and-filter-change-mobile-mechanic/
- No clonar sitios ni reutilizar fotos/logos sin derechos. No implicar afiliación con proveedores/fabricantes.

## Estado del prototipo
El `index.html` incluido es un prototipo de una sola página con diseño inicial, SEO básico, catálogo demostrativo de 50 modelos, cuatro tipos de pack, cálculo de precio/margen, solicitud de cotización/reserva de demostración y exportación CSV. Inspecciona el código y confirma qué está implementado realmente. No es aún una aplicación de producción: no asumir que formularios persisten, que las reservas llegan, que precios son reales o que compatibilidades están verificadas.

## Packs comerciales
1. Esencial: aceite + filtro de aceite + mano de obra + revisión básica.
2. Estándar: esencial + filtro de aire, cuando aplique.
3. Completo: aceite + filtro de aceite + filtro de aire + filtro de habitáculo/polen, cuando aplique.
4. Diésel: aceite correcto + filtro de aceite + filtro de aire + filtro de combustible/separador de agua cuando corresponda; filtro de habitáculo opcional.
Son plantillas. No todos los vehículos usan todos los filtros ni las mismas especificaciones.

## Compatibilidad: regla crítica
No inventar códigos de filtros, equivalencias, viscosidades, normas API/ACEA/OEM, capacidades, intervalos ni aplicaciones. Para cada variante registrar marca, modelo, generación, años, combustible, cilindrada, motor/código de motor y mercado; aceite recomendado (SAE, normas, capacidad con/sin filtro); filtros de aceite/aire/habitáculo/combustible (marca y código); proveedor/SKU; fuente y URL; fecha de consulta; notas; estado (`verified`, `needs_review`, `unavailable`) y responsable de revisión. No vender como compatible si no está validado por fuente técnica fiable. Si faltan datos, ofrecer “solicitar validación/cotización”. Priorizar APIs, catálogos autorizados, acuerdos o carga manual; respetar términos de uso y derechos de autor.

## Catálogo por fases
- Fase 1: autos, SUV y camionetas populares en Chile.
- Fase 2: furgones comerciales y camionetas diésel.
- Fase 3: camiones livianos y pesados, por motor y código de motor.
- Fase 4: ampliar según datos verificados y demanda.
Candidatos iniciales, no compatibilidades confirmadas: Toyota Yaris, Corolla, RAV4, Hilux; Hyundai Accent, Tucson, H-1, Porter; Kia Rio, Sportage, Frontier; Chevrolet Sail, Tracker; Mitsubishi L200; Nissan NP300; Maxus T60; JAC; Foton; Sinotruk; Shacman; Volvo; Scania; Mercedes-Benz. Priorizar con evidencia de demanda chilena.

## Requisitos de producto y diseño
- Sitio profesional, responsive, rápido y accesible; imágenes autorizadas, optimizadas y con alt text.
- Buscador marca → modelo → año → motor/versión, búsqueda textual y filtros por tipo/combustible.
- Mostrar logos solo si su uso está permitido; fallback de texto si no hay recurso.
- Resultado con packs compatibles, contenido, cantidades, referencias, cobertura, precio transparente y CTA.
- Diferenciar solicitud pendiente de reserva confirmada; no inventar disponibilidad.
- Formulario breve: nombre, teléfono, email opcional, comuna/dirección aproximada, vehículo/versión, kilometraje, pack, fecha/hora preferida, comentarios y consentimiento de contacto/privacidad. Validar y proteger contra spam.
- WhatsApp configurable; no inventar teléfono. Confirmaciones por email/WhatsApp solo si la integración está conectada y probada.
- Panel administrativo protegido: CRUD de vehículos, variantes, productos, proveedores, equivalencias, packs, precios, solicitudes y estados; permisos y auditoría.
- Estados sugeridos: nueva, contactada, cotizando, pendiente de confirmación, confirmada, completada, cancelada.
- Exportación CSV con permisos. No exponer costos ni secretos en frontend.

## Tecnología e integraciones
Inspecciona el repositorio y la infraestructura real. Si existe Supabase, considera usarlo para catálogo y solicitudes: esquema SQL/migraciones, índices, relaciones, RLS, políticas mínimas para crear solicitudes y administración restringida. Nunca exponer `service_role` en el navegador. Si hay stack existente, conservarlo salvo razón clara.
Crear `.env.example` con nombres de variables y valores ficticios, nunca secretos. Documentar instalación, configuración, migraciones, despliegue, backups y carga de catálogo. Añadir pruebas para margen, búsqueda, compatibilidad y envío de solicitud.

## Modelo de datos sugerido
`vehicle_makes`, `vehicle_models`, `vehicle_variants`, `lubricants`, `filters`, `vehicle_applications`, `suppliers`, `maintenance_packs`, `maintenance_pack_items`, `service_areas`, `service_requests`, `request_status_history` y roles de administración según arquitectura. Costos y márgenes visibles solo para personal autorizado.

## Precio y contabilidad
Costo directo = aceite + filtros + insumos + mano de obra + traslado atribuible + disposición de aceite usado + otros costos directos. Precio neto objetivo = costo directo / 0,30. Separar costo, precio neto, IVA, precio final y margen. Validar el tratamiento de IVA con contador chileno. No publicar precios si el costo está desactualizado o la aplicación no está validada. El margen bruto no equivale a rentabilidad neta después de gastos generales, publicidad, pagos y garantías.

## SEO y captación
- Titles/descriptions únicos, canonical, Open Graph, sitemap.xml, robots.txt y datos estructurados solo cuando procedan.
- Contenido útil para “cambio de aceite a domicilio en Santiago” y comunas atendidas. Evitar páginas puerta sin contenido real.
- Preparar eventos analíticos: búsqueda de vehículo, vista de pack, inicio/envío de formulario, clic WhatsApp y reserva confirmada.
- Configurar Google/Meta solo con IDs proporcionados y respetando consentimiento/privacidad. No inventar IDs.
- Preparar contenido claro y rastreable para motores de búsqueda y sistemas de descubrimiento; no prometer ranking ni aparición en ChatGPT.
- Preparar estructura de campañas, pero no publicarlas ni gastar dinero sin autorización expresa.

## Entregables
1. Diagnóstico del prototipo y de las integraciones reales.
2. Aplicación terminada, responsive y ejecutable.
3. Esquema/migraciones y políticas de seguridad si corresponde.
4. Hasta 50 aplicaciones priorizadas solo con datos verificados; pendientes claramente marcados.
5. Panel admin y solicitudes persistentes, o lista explícita de credenciales/configuración pendiente.
6. CSV/plantillas de importación/exportación.
7. SEO técnico y analítica preparada.
8. Tests ejecutados y reporte de resultados.
9. README de instalación/despliegue y lista exacta de variables que el propietario debe configurar.
10. Lista de pendientes que requieren proveedor, licencia, credenciales o decisión del propietario.

## Orden de ejecución
A) Inspeccionar código/entorno y guardar copia. B) Diseñar modelo de datos y fuentes. C) Implementar catálogo y buscador. D) Packs y cálculo de precio. E) Solicitudes y panel seguro. F) Mejorar diseño y rendimiento. G) SEO, analítica y exportación. H) Tests y revisión de seguridad. I) Documentar qué funciona, qué está conectado y qué queda pendiente.

## Criterios de aceptación
- Diseño profesional en móvil y escritorio.
- El buscador solo muestra compatibilidades verificadas; si faltan datos, informa y ofrece validación.
- Fórmula de margen correcta y probada.
- Solicitudes guardadas en backend y administrables, o configuración faltante documentada.
- El público no puede ver costos internos ni datos de otros clientes.
- Sin secretos expuestos, datos técnicos inventados ni agenda ficticia.
- Integraciones y pruebas documentadas.

## Primera acción
Abre `index.html`, inspecciona el entorno conectado (repositorio, Supabase, hosting, proveedores y herramientas autorizadas), presenta un diagnóstico corto de los activos reales y luego ejecuta la implementación completa. Detente únicamente ante acciones irreversibles, publicación pública, gasto, compra de datos/licencias o credenciales que no estén disponibles.
