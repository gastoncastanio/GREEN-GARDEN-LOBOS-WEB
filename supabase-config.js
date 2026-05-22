// Configuración Supabase - GREEN GARDEN LOBOS
const SUPABASE_URL = 'https://qscsknclckkckajcrccb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_azBFqUtAUyl-oosGB3sq7Q_-q0jA4Lv';

const _h = () => ({
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
});

// ============ REALTIME (WebSocket nativo Supabase) ============
const _realtimeChannels = new Map();
function _connectRealtime() {
  if (window._ggRealtimeWS && window._ggRealtimeWS.readyState <= 1) return window._ggRealtimeWS;
  const wsUrl = SUPABASE_URL.replace('https://','wss://') + '/realtime/v1/websocket?apikey=' + SUPABASE_KEY + '&vsn=1.0.0';
  const ws = new WebSocket(wsUrl);
  window._ggRealtimeWS = ws;
  let ref = 0;
  const send = (msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  ws.addEventListener('open', () => {
    // Re-subscribir canales activos
    _realtimeChannels.forEach((cb, topic) => {
      send({ topic, event: 'phx_join', payload: { config: { broadcast: { self: false }, postgres_changes: [{ event: '*', schema: 'public', table: topic.split(':')[1] }] } }, ref: ++ref });
    });
    // Heartbeat
    setInterval(() => send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: ++ref }), 25000);
  });
  ws.addEventListener('message', (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === 'postgres_changes' && msg.payload?.data) {
        const cb = _realtimeChannels.get(msg.topic);
        if (cb) cb(msg.payload.data);
      }
    } catch(e){}
  });
  ws.addEventListener('close', () => {
    setTimeout(() => _connectRealtime(), 3000);  // reconectar
  });
  return ws;
}

const supabase = {
  // Suscribirse a cambios en una tabla. Devuelve función para desuscribirse.
  subscribeTable(table, callback){
    const topic = `realtime:${table}`;
    _realtimeChannels.set(topic, callback);
    _connectRealtime();
    return () => _realtimeChannels.delete(topic);
  },

  // ============ CONTENT (textos editables) ============
  async getContent() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/site_content?select=*`, { headers: _h() });
    if (!res.ok) return {};
    const data = await res.json();
    const c = {};
    data.forEach(r => { c[r.id] = r.value; });
    return c;
  },
  async setContent(id, value) {
    // 1) Intentar PATCH (update) — devolvemos representation para saber si afectó filas
    const patch = await fetch(`${SUPABASE_URL}/rest/v1/site_content?id=eq.${id}`, {
      method: 'PATCH', headers: { ..._h(), 'Prefer': 'return=representation' },
      body: JSON.stringify({ value, updated_at: new Date().toISOString() })
    });
    if (patch.ok) {
      const data = await patch.json();
      if (Array.isArray(data) && data.length > 0) return true; // se actualizó algo
    }
    // 2) Si no existía la fila, hacer INSERT
    const insert = await fetch(`${SUPABASE_URL}/rest/v1/site_content`, {
      method: 'POST', headers: { ..._h(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ id, value, updated_at: new Date().toISOString() })
    });
    return insert.ok;
  },

  // ============ PRODUCTOS ============
  async getProductos() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/productos?select=*&activo=eq.true&order=categoria.asc,orden.asc`, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },
  async getProductoById(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/productos?id=eq.${id}&select=*`, { headers: _h() });
    if (!res.ok) return null;
    const d = await res.json();
    return d[0] || null;
  },
  async updateProducto(id, fields) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/productos?id=eq.${id}`, {
      method: 'PATCH', headers: { ..._h(), 'Prefer': 'return=minimal' },
      body: JSON.stringify(fields)
    });
    return res.ok;
  },
  async createProducto(p) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/productos`, {
      method: 'POST', headers: { ..._h(), 'Prefer': 'return=representation' },
      body: JSON.stringify(p)
    });
    return res.ok ? (await res.json())[0] : null;
  },
  async deleteProducto(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/productos?id=eq.${id}`, {
      method: 'DELETE', headers: _h()
    });
    return res.ok;
  },
  async uploadProductoImagen(productoId, file) {
    const ext = file.name.split('.').pop();
    const fileName = `${productoId}_${Date.now()}.${ext}`;
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/productos/${fileName}`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': file.type },
      body: file
    });
    if (!up.ok) return null;
    const url = `${SUPABASE_URL}/storage/v1/object/public/productos/${fileName}`;
    await this.updateProducto(productoId, { imagen_url: url });
    return url;
  },

  // ============ EMPLEADOS ============
  async loginEmpleado(pin) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/empleados?pin=eq.${encodeURIComponent(pin)}&activo=eq.true&select=*`, { headers: _h() });
    if (!res.ok) return null;
    const d = await res.json();
    return d[0] || null;
  },
  async getEmpleados() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/empleados?select=*&order=nombre.asc`, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },
  async createEmpleado(e) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/empleados`, {
      method: 'POST', headers: { ..._h(), 'Prefer': 'return=representation' },
      body: JSON.stringify(e)
    });
    return res.ok ? (await res.json())[0] : null;
  },
  // SOFT DELETE: marca al empleado como inactivo en lugar de borrarlo.
  // Esto preserva el historial de pedidos asignados a ese empleado.
  async deleteEmpleado(id) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/empleados?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ..._h(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ activo: false })
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('[deleteEmpleado] HTTP', res.status, errText);
      }
      return res.ok;
    } catch (e) {
      console.error('[deleteEmpleado] Error:', e);
      return false;
    }
  },

  // Reactivar un empleado dado de baja
  async reactivarEmpleado(id) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/empleados?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ..._h(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ activo: true })
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('[reactivarEmpleado] HTTP', res.status, errText);
      }
      return res.ok;
    } catch (e) {
      console.error('[reactivarEmpleado] Error:', e);
      return false;
    }
  },

  // ============ PEDIDOS ============
  async getPedidos() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?select=*&order=created_at.desc`, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },
  async getPedidoByCodigo(codigo) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?codigo=eq.${encodeURIComponent(codigo)}&select=*`, { headers: _h() });
    if (!res.ok) return null;
    const d = await res.json();
    return d[0] || null;
  },
  async createPedido(p) {
    // Generar código único legible: GG-AAAAMMDD-XXXX
    const today = new Date();
    const ymd = today.toISOString().slice(0,10).replace(/-/g,'');
    const rnd = Math.floor(1000 + Math.random()*9000);
    const codigo = `GG-${ymd}-${rnd}`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pedidos`, {
      method: 'POST', headers: { ..._h(), 'Prefer': 'return=representation' },
      body: JSON.stringify({ ...p, codigo, estado: 'recibido' })
    });
    if (!res.ok) return null;
    const r = (await res.json())[0];
    return r;
  },
  async updatePedido(id, fields) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${id}`, {
      method: 'PATCH', headers: { ..._h(), 'Prefer': 'return=minimal' },
      body: JSON.stringify(fields)
    });
    return res.ok;
  },
  async deletePedido(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${id}`, { method: 'DELETE', headers: _h() });
    return res.ok;
  },

  // ============ EVENTOS DE PEDIDO ============
  async getEventos(pedidoId) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pedidos_eventos?pedido_id=eq.${pedidoId}&select=*&order=created_at.asc`, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },
  async addEvento(pedidoId, estado, comentario, empleadoNombre) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pedidos_eventos`, {
      method: 'POST', headers: { ..._h(), 'Prefer': 'return=representation' },
      body: JSON.stringify({ pedido_id: pedidoId, estado, comentario, empleado_nombre: empleadoNombre })
    });
    return res.ok;
  },

  // ============ BOLETAS (subida de archivos) ============
  async uploadBoleta(pedidoCodigo, file) {
    const ext = file.name.split('.').pop();
    const fileName = `boleta_${pedidoCodigo || 'sin-codigo'}_${Date.now()}.${ext}`;
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/boletas/${fileName}`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    if (!up.ok) return null;
    return `${SUPABASE_URL}/storage/v1/object/public/boletas/${fileName}`;
  },

  // ============ STOCK ============
  async getStock() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/stock?select=*,productos(id,nombre,categoria,imagen_url)`, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },
  async setStockProducto(producto_id, fields) {
    // Upsert
    const res = await fetch(`${SUPABASE_URL}/rest/v1/stock?producto_id=eq.${producto_id}`, {
      method: 'PATCH', headers: { ..._h(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() })
    });
    if (res.ok) return true;
    // si no existe, crear
    const create = await fetch(`${SUPABASE_URL}/rest/v1/stock`, {
      method: 'POST', headers: { ..._h(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ producto_id, ...fields })
    });
    return create.ok;
  },
  async ingresarStock(producto_id, cantidad, motivo, empleadoNombre) {
    // Sumar al stock_actual
    const cur = await fetch(`${SUPABASE_URL}/rest/v1/stock?producto_id=eq.${producto_id}&select=stock_actual`, { headers: _h() });
    const data = await cur.json();
    const actual = data[0]?.stock_actual || 0;
    await this.setStockProducto(producto_id, { stock_actual: parseFloat(actual) + parseFloat(cantidad), ultimo_ingreso: new Date().toISOString() });
    await fetch(`${SUPABASE_URL}/rest/v1/stock_movimientos`, {
      method: 'POST', headers: { ..._h(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ producto_id, tipo: 'ingreso', cantidad, motivo: motivo||'Ingreso manual', empleado_nombre: empleadoNombre })
    });
    return true;
  },
  async getMovimientos(producto_id) {
    const url = producto_id
      ? `${SUPABASE_URL}/rest/v1/stock_movimientos?producto_id=eq.${producto_id}&select=*&order=created_at.desc&limit=50`
      : `${SUPABASE_URL}/rest/v1/stock_movimientos?select=*&order=created_at.desc&limit=50`;
    const res = await fetch(url, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },

  // ============ ANALÍTICA ============
  async getRankingProductos() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/v_ranking_productos?select=*&limit=200`, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },

  async getResumenAnalitica(desde, hasta) {
    // desde y hasta = ISO date strings (YYYY-MM-DD)
    let filtros = '';
    if (desde) filtros += `&created_at=gte.${desde}T00:00:00`;
    if (hasta) filtros += `&created_at=lte.${hasta}T23:59:59`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?select=*${filtros}&order=created_at.desc`, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },

  // ============ GALLERY (legacy compat) ============
  async getGalleryImages() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/gallery_images?select=*`, { headers: _h() });
    if (!res.ok) return {};
    const d = await res.json();
    const o = {};
    d.forEach(r => { o[r.slot] = r.image_url; });
    return o;
  },
  async uploadImage(slot, file) {
    const ext = file.name.split('.').pop();
    const fileName = `${slot}_${Date.now()}.${ext}`;
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/gallery/${fileName}`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': file.type },
      body: file
    });
    if (!up.ok) return null;
    const url = `${SUPABASE_URL}/storage/v1/object/public/gallery/${fileName}`;
    await fetch(`${SUPABASE_URL}/rest/v1/gallery_images`, {
      method: 'POST',
      headers: { ..._h(), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ slot, image_url: url, updated_at: new Date().toISOString() })
    });
    return url;
  },

  // ============================================
  // SISTEMA DE PROVEEDORES Y LISTAS DE PRECIOS
  // ============================================

  // ---- CATEGORÍAS ----
  async getCategorias() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/categorias_productos?select=*&order=orden.asc`, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },
  async createCategoria(c) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/categorias_productos`, {
      method: 'POST', headers: { ..._h(), 'Prefer': 'return=representation' },
      body: JSON.stringify(c)
    });
    return res.ok ? (await res.json())[0] : null;
  },
  async updateCategoria(id, fields) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/categorias_productos?id=eq.${id}`, {
      method: 'PATCH', headers: { ..._h(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() })
    });
    return res.ok;
  },
  async deleteCategoria(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/categorias_productos?id=eq.${id}`, {
      method: 'DELETE', headers: _h()
    });
    return res.ok;
  },

  // ---- PROVEEDORES ----
  async getProveedores() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/proveedores?select=*&order=nombre.asc`, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },
  async getProveedorById(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/proveedores?id=eq.${id}&select=*`, { headers: _h() });
    if (!res.ok) return null;
    const d = await res.json();
    return d[0] || null;
  },
  async createProveedor(p) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/proveedores`, {
      method: 'POST', headers: { ..._h(), 'Prefer': 'return=representation' },
      body: JSON.stringify(p)
    });
    return res.ok ? (await res.json())[0] : null;
  },
  async updateProveedor(id, fields) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/proveedores?id=eq.${id}`, {
      method: 'PATCH', headers: { ..._h(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() })
    });
    return res.ok;
  },
  async deleteProveedor(id) {
    // Soft delete: marca inactivo
    const res = await fetch(`${SUPABASE_URL}/rest/v1/proveedores?id=eq.${id}`, {
      method: 'PATCH', headers: { ..._h(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ activo: false, updated_at: new Date().toISOString() })
    });
    return res.ok;
  },

  // ---- CATÁLOGO DE PRECIOS ----
  async getCatalogo(filtros = {}) {
    let q = '?select=*,categoria:categorias_productos(id,nombre,margen_default_pct),proveedor_actual:proveedores(id,nombre)&order=tipo.asc,nombre.asc';
    if (filtros.categoria_id) q += `&categoria_id=eq.${filtros.categoria_id}`;
    if (filtros.tipo) q += `&tipo=eq.${filtros.tipo}`;
    if (filtros.activo !== undefined) q += `&activo=eq.${filtros.activo}`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/catalogo_precios${q}`, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },
  async getProductoCatalogo(codigo) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/catalogo_precios?codigo=eq.${codigo}&select=*`, { headers: _h() });
    if (!res.ok) return null;
    const d = await res.json();
    return d[0] || null;
  },
  async updateProductoCatalogo(id, fields) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/catalogo_precios?id=eq.${id}`, {
      method: 'PATCH', headers: { ..._h(), 'Prefer': 'return=minimal' },
      body: JSON.stringify(fields)
    });
    return res.ok;
  },
  async createProductoCatalogo(p) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/catalogo_precios`, {
      method: 'POST', headers: { ..._h(), 'Prefer': 'return=representation' },
      body: JSON.stringify(p)
    });
    return res.ok ? (await res.json())[0] : null;
  },

  // ---- RELACIÓN PRODUCTO-PROVEEDOR ----
  async getProductoProveedores(catalogo_id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/producto_proveedor?catalogo_id=eq.${catalogo_id}&select=*,proveedor:proveedores(id,nombre)&order=es_preferido.desc`, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },
  async addProductoProveedor(data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/producto_proveedor`, {
      method: 'POST', headers: { ..._h(), 'Prefer': 'return=representation' },
      body: JSON.stringify(data)
    });
    return res.ok ? (await res.json())[0] : null;
  },
  async updateProductoProveedor(id, fields) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/producto_proveedor?id=eq.${id}`, {
      method: 'PATCH', headers: { ..._h(), 'Prefer': 'return=minimal' },
      body: JSON.stringify(fields)
    });
    return res.ok;
  },
  async deleteProductoProveedor(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/producto_proveedor?id=eq.${id}`, {
      method: 'DELETE', headers: _h()
    });
    return res.ok;
  },

  // ---- HISTORIAL DE PRECIOS ----
  async getHistorialPrecios(filtros = {}) {
    let q = '?select=*,catalogo:catalogo_precios(codigo,nombre),proveedor:proveedores(nombre)&order=fecha_cambio.desc&limit=500';
    if (filtros.catalogo_id) q += `&catalogo_id=eq.${filtros.catalogo_id}`;
    if (filtros.trimestre) q += `&trimestre=eq.${filtros.trimestre}`;
    if (filtros.tipo_precio) q += `&tipo_precio=eq.${filtros.tipo_precio}`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/precios_historico${q}`, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },

  // ---- DESCUENTOS POR VOLUMEN ----
  async getDescuentosVolumen(catalogo_id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/descuentos_volumen?catalogo_id=eq.${catalogo_id}&select=*&order=cantidad_minima.asc`, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },
  async addDescuentoVolumen(data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/descuentos_volumen`, {
      method: 'POST', headers: { ..._h(), 'Prefer': 'return=representation' },
      body: JSON.stringify(data)
    });
    return res.ok ? (await res.json())[0] : null;
  },
  async deleteDescuentoVolumen(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/descuentos_volumen?id=eq.${id}`, {
      method: 'DELETE', headers: _h()
    });
    return res.ok;
  },

  // ============================================
  // SISTEMA DE TAREAS
  // ============================================

  // ---- TAREAS ----
  async getTareas(filtros = {}) {
    let q = '?select=*,asignados:tareas_asignados(id,empleado_id,empleado_nombre,estado_individual,empleado:empleados(id,nombre,rol))&order=created_at.desc';
    if (filtros.estado) q += `&estado=eq.${filtros.estado}`;
    if (filtros.prioridad) q += `&prioridad=eq.${filtros.prioridad}`;
    if (filtros.empleado_id) {
      // Filtro por empleado requiere subconsulta — lo hacemos en cliente para simplicidad
    }
    if (filtros.limit) q += `&limit=${filtros.limit}`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tareas${q}`, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },

  async getTareaById(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tareas?id=eq.${id}&select=*,asignados:tareas_asignados(*,empleado:empleados(id,nombre,rol)),comentarios:tareas_comentarios(*)`, { headers: _h() });
    if (!res.ok) return null;
    const d = await res.json();
    return d[0] || null;
  },

  async createTarea(data) {
    const { asignados, ...tarea } = data;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tareas`, {
      method: 'POST', headers: { ..._h(), 'Prefer': 'return=representation' },
      body: JSON.stringify(tarea)
    });
    if (!res.ok) return null;
    const creada = (await res.json())[0];
    // Asignar empleados (puede ser más de uno)
    if (asignados && asignados.length > 0) {
      const asignacionesRes = await fetch(`${SUPABASE_URL}/rest/v1/tareas_asignados`, {
        method: 'POST', headers: _h(),
        body: JSON.stringify(asignados.map(a => ({
          tarea_id: creada.id,
          empleado_id: a.empleado_id,
          empleado_nombre: a.empleado_nombre || null
        })))
      });
    }
    return creada;
  },

  async updateTarea(id, fields) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tareas?id=eq.${id}`, {
      method: 'PATCH', headers: { ..._h(), 'Prefer': 'return=minimal' },
      body: JSON.stringify(fields)
    });
    return res.ok;
  },

  async deleteTarea(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tareas?id=eq.${id}`, {
      method: 'DELETE', headers: _h()
    });
    return res.ok;
  },

  // ---- ASIGNACIONES ----
  async addAsignacion(tarea_id, empleado_id, empleado_nombre) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tareas_asignados`, {
      method: 'POST', headers: _h(),
      body: JSON.stringify({ tarea_id, empleado_id, empleado_nombre })
    });
    return res.ok;
  },

  async removeAsignacion(asignacion_id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tareas_asignados?id=eq.${asignacion_id}`, {
      method: 'DELETE', headers: _h()
    });
    return res.ok;
  },

  async updateAsignacionEstado(asignacion_id, estado_individual) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tareas_asignados?id=eq.${asignacion_id}`, {
      method: 'PATCH', headers: { ..._h(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ estado_individual, updated_at: new Date().toISOString() })
    });
    return res.ok;
  },

  // ---- COMENTARIOS ----
  async addComentarioTarea(tarea_id, empleado_id, empleado_nombre, comentario) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tareas_comentarios`, {
      method: 'POST', headers: _h(),
      body: JSON.stringify({ tarea_id, empleado_id, empleado_nombre, comentario })
    });
    return res.ok;
  },

  async getComentariosTarea(tarea_id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tareas_comentarios?tarea_id=eq.${tarea_id}&select=*&order=created_at.desc`, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },

  // ---- NOTIFICACIONES ----
  async getNotificaciones(empleado_id, soloNoLeidas = false) {
    let q = `?select=*&empleado_id=eq.${empleado_id}&order=created_at.desc&limit=50`;
    if (soloNoLeidas) q += '&leida=eq.false';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/notificaciones${q}`, { headers: _h() });
    if (!res.ok) return [];
    return await res.json();
  },

  async marcarNotificacionLeida(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/notificaciones?id=eq.${id}`, {
      method: 'PATCH', headers: { ..._h(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ leida: true, fecha_leida: new Date().toISOString() })
    });
    return res.ok;
  },

  async marcarTodasNotifLeidas(empleado_id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/notificaciones?empleado_id=eq.${empleado_id}&leida=eq.false`, {
      method: 'PATCH', headers: { ..._h(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ leida: true, fecha_leida: new Date().toISOString() })
    });
    return res.ok;
  },

  // ---- GENERAR TAREAS RECURRENTES (admin) ----
  async generarRecurrentes() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_generar_recurrentes`, {
      method: 'POST', headers: _h()
    });
    if (!res.ok) return 0;
    return await res.json();
  },

  // ---- CÁLCULO DE PRECIOS (lado cliente) ----
  // Calcula los 4 precios de una lista a partir del minorista_sin_iva, costo y margen
  calcularPrecios(producto) {
    const minSinIva = parseFloat(producto.precio_minorista_sin_iva || 0);
    const costo = parseFloat(producto.costo_proveedor_actual || 0);
    const margen = parseFloat(producto.margen_personalizado_pct ?? producto.categoria?.margen_default_pct ?? 35);
    const factorIva = parseFloat(producto.factor_iva || 1.105);

    const minoristaConIva = Math.round(minSinIva * factorIva);
    const mayoristaSinIva = costo > 0 ? Math.round(costo * (1 + margen / 100)) : minSinIva;
    const mayoristaConIva = Math.round(mayoristaSinIva * factorIva);
    const rentabilidad = minSinIva > 0 && costo > 0 ? Math.round(((minSinIva - costo) / minSinIva) * 100) : 0;

    return {
      minoristaSinIva: minSinIva,
      minoristaConIva,
      mayoristaSinIva,
      mayoristaConIva,
      rentabilidad,
      margenAplicado: margen
    };
  }
};
