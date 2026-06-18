(function initRutasDetalleTemplatesModule(global) {
  global.RutasDetalleTemplatesModule = function createRutasDetalleTemplatesModule({
    state,
    escapeHtml,
    mostrarToast,
    setBtnLoading,
    optimizeImage
  }) {
    let previewTypingTimer = null;

    function formatFileSize(bytes) {
      if (!bytes || bytes === 0) return '0 KB';
      const kb = bytes / 1024;
      if (kb < 1024) return kb.toFixed(1) + ' KB';
      return (kb / 1024).toFixed(1) + ' MB';
    }

    function getPlantillaNombre(plantilla) {
      return plantilla?.nombre || plantilla?.name || 'Plantilla';
    }

    function getPlantillaMensaje(plantilla) {
      return plantilla?.mensaje || plantilla?.contenido || plantilla?.content || '';
    }

    function syncPlantillaActivaLabel() {
      const plantilla = state.plantillas.find((item) => String(item.id) === String(state.selectedPlantillaId));
      SharedUI.setText('plantilla-activa-label', plantilla ? getPlantillaNombre(plantilla) : 'Sin plantilla seleccionada');
    }

    function setPlantillaFeedback(message, type) {
      const feedback = document.getElementById('plantilla-modal-feedback');
      if (!feedback) return;

      if (!message) {
        feedback.className = '';
        feedback.style.display = 'none';
        feedback.textContent = '';
        return;
      }

      feedback.className = type;
      feedback.style.display = 'block';
      feedback.textContent = message;
    }

    function fillPlantillaForm(plantilla) {
      state.editingPlantillaId = plantilla.id;
      const nombre = document.getElementById('plantilla-modal-nombre');
      const mensaje = document.getElementById('plantilla-modal-mensaje');
      const title = document.getElementById('template-editor-title');
      const saveBtn = document.getElementById('btn-guardar-plantilla-modal');
      const imageInfo = document.getElementById('plantilla-imagen-info');
      const fileCard = document.getElementById('file-card-preview');

      if (nombre) nombre.value = getPlantillaNombre(plantilla);
      if (mensaje) mensaje.value = getPlantillaMensaje(plantilla);
      if (title) title.textContent = 'Editar plantilla';
      if (saveBtn) saveBtn.textContent = 'Guardar cambios';

      state.templateImageBase64 = null;
      state.templateImageName = null;
      state.templateImageBorrar = false;

      if (imageInfo) imageInfo.textContent = plantilla.imagen_path ? 'Cambiar imagen' : 'Subir imagen';
      if (fileCard) {
        const hasImage = !!plantilla.imagen_path;
        fileCard.style.display = hasImage ? 'flex' : 'none';
        if (hasImage) {
          const nameEl = document.getElementById('file-card-name');
          if (nameEl) nameEl.textContent = 'Imagen adjunta';

          const img = document.getElementById('file-card-img');
          const imgPath = getPlantillaImagePath(plantilla);
          const resolvedSrc = resolveMediaUrl(imgPath);
          if (img && resolvedSrc) {
            img.src = resolvedSrc;
            img.style.display = 'block';
            img.onload = () => {
              const dims = document.getElementById('file-card-dims');
              if (dims) dims.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
            };
            img.onerror = () => { img.style.display = 'none'; };
          }

          const sizeEl = document.getElementById('file-card-size');
          if (sizeEl) sizeEl.textContent = '—';
        }
      }

      setPlantillaFeedback('', '');
    }

    function resetPlantillaForm(clearFeedback = true) {
      state.editingPlantillaId = null;
      state.templateImageBase64 = null;
      state.templateImageName = null;
      state.templateImageBorrar = false;

      const form = document.getElementById('form-plantilla-modal');
      const title = document.getElementById('template-editor-title');
      const saveBtn = document.getElementById('btn-guardar-plantilla-modal');
      const imageInput = document.getElementById('plantilla-modal-imagen');
      const imageInfo = document.getElementById('plantilla-imagen-info');
      const fileCard = document.getElementById('file-card-preview');

      form?.reset();
      if (imageInput) imageInput.value = '';
      if (imageInfo) imageInfo.textContent = 'Subir imagen';
      if (fileCard) fileCard.style.display = 'none';
      if (title) title.textContent = 'Nueva plantilla';
      if (saveBtn) {
        saveBtn.textContent = 'Guardar plantilla';
        delete saveBtn.dataset.label;
      }
      if (clearFeedback) setPlantillaFeedback('', '');
    }

    function toggleTemplatesModal(open) {
      document.getElementById('modal-plantillas')?.classList.toggle('open', open);
    }

    function togglePlantillaEditorModal(open, clearForm = true) {
      document.getElementById('modal-plantilla-editor')?.classList.toggle('open', open);
      if (!open && clearForm) resetPlantillaForm();
    }

    function replaceTemplateVars(text, aviso) {
      return String(text || '')
        .replaceAll('{nombre}', aviso.nombre || '')
        .replaceAll('{codigo_paquete}', aviso.codigo_paquete || '')
        .replaceAll('{codigo}', aviso.codigo_paquete || '')
        .replaceAll('{telefono}', aviso.telefono || '');
    }

    function formatPreviewMessage(text) {
      const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
      const html = lines.map((line) => {
        const escaped = escapeHtml(line);
        const bolded = escaped.replace(/\*(.+?)\*/g, '<strong>$1</strong>');
        return `<div class="wa-msg-line">${bolded}</div>`;
      });
      return `<div class="wa-msg-preview wa-msg-plain">${html.join('')}</div>`;
    }

    function resolveMediaUrl(path) {
      const value = String(path || '').trim();
      if (!value) return '';
      if (/^(data:|blob:|https?:\/\/)/i.test(value)) return value;

      const normalizedPath = value.replace(/\\/g, '/').replace(/^\/+/, '');
      const configuredBase = window.__APP_CONFIG__?.apiBase || window.__API_BASE__ || '/api';
      const appBase = String(configuredBase).replace(/\/api\/?$/, '').replace(/\/$/, '');
      return `${appBase}/${normalizedPath}`;
    }

    function getPlantillaImagePath(plantilla) {
      return plantilla?.imagen_url || plantilla?.imagenPath || plantilla?.imagen_path || '';
    }

    function renderPreviewImage(container, src) {
      container.innerHTML = '';
      const resolvedSrc = resolveMediaUrl(src);
      if (!resolvedSrc) return;

      const image = document.createElement('img');
      image.className = 'wa-bubble-img';
      image.src = resolvedSrc;
      image.alt = 'Imagen de plantilla';
      image.loading = 'lazy';
      image.addEventListener('error', () => {
        container.innerHTML = '<div class="wa-image-missing">Imagen no disponible</div>';
      }, { once: true });

      container.appendChild(image);
    }

    async function updatePreview() {
      const bubble = document.getElementById('wa-bubble');
      const empty = document.getElementById('bubble-empty');
      const imgWrap = document.getElementById('wa-img-wrap');
      const textEl = document.getElementById('wa-bubble-text');
      const timeEl = document.getElementById('wa-btime-val');
      const typing = document.getElementById('wa-typing');
      const previewClock = document.getElementById('preview-clock');
      const previewContactName = document.getElementById('wa-contact-name');
      const previewContactStatus = document.getElementById('wa-contact-status');

      if (!bubble || !empty || !imgWrap || !textEl || !timeEl || !typing) return;

      const plantilla = state.plantillas.find((item) => String(item.id) === String(state.selectedPlantillaId));
      syncPlantillaActivaLabel();
      const baseMessage = getPlantillaMensaje(plantilla);
      const sample = state.avisos[0] || {
        nombre: 'Maria Lopez',
        codigo_paquete: 'ENC-001',
        telefono: '51987654321'
      };

      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      if (previewClock) previewClock.textContent = hhmm;
      if (previewContactName) previewContactName.textContent = sample.nombre || 'MyG Express';
      if (previewContactStatus) previewContactStatus.textContent = state.selectedSessionId ? 'En sesión elegida' : 'Sin sesión seleccionada';

      if (!baseMessage) {
        if (previewTypingTimer) {
          clearTimeout(previewTypingTimer);
          previewTypingTimer = null;
        }
        empty.style.display = 'block';
        bubble.style.display = 'none';
        typing.classList.remove('vis');
        imgWrap.innerHTML = '';
        textEl.innerHTML = '';
        return;
      }

      const finalMessage = replaceTemplateVars(baseMessage, sample);
      empty.style.display = 'none';
      bubble.style.display = 'none';
      typing.classList.add('vis');
      timeEl.textContent = hhmm;

      if (previewTypingTimer) clearTimeout(previewTypingTimer);
      previewTypingTimer = window.setTimeout(() => {
        typing.classList.remove('vis');
        bubble.style.display = 'block';
        const selectedPlantilla = state.plantillas.find((item) => String(item.id) === String(state.selectedPlantillaId));
        const plantillaImagePath = getPlantillaImagePath(selectedPlantilla);

        if (state.templateImageBase64 && !state.templateImageBorrar) {
          renderPreviewImage(imgWrap, state.templateImageBase64);
        } else if (plantillaImagePath && !state.templateImageBorrar) {
          renderPreviewImage(imgWrap, plantillaImagePath);
        } else {
          imgWrap.innerHTML = '';
        }

        textEl.innerHTML = formatPreviewMessage(finalMessage);
      }, 550);
    }

    async function eliminarPlantilla(id) {
      const plantilla = state.plantillas.find((item) => String(item.id) === String(id));
      const nombre = getPlantillaNombre(plantilla);

      const confirmed = await SharedUI.confirm({ title: 'Eliminar plantilla', message: `Se eliminara la plantilla "${nombre}". Deseas continuar?`, confirmText: 'Eliminar', cancelText: 'Cancelar', type: 'danger' });
      if (!confirmed) return;

      try {
        await API.Plantillas.eliminar(id);
        if (String(state.selectedPlantillaId) === String(id)) state.selectedPlantillaId = null;
        if (String(state.editingPlantillaId) === String(id)) resetPlantillaForm();
        await loadTemplates();
        renderTemplates();
        updatePreview();
        mostrarToast('Plantilla eliminada.', 'success');
      } catch (error) {
        setPlantillaFeedback(error?.message || 'No se pudo eliminar la plantilla.', 'error');
      }
    }

    async function seleccionarPlantillaComoDefault(plantillaId) {
      if (!plantillaId || String(state.selectedPlantillaId) === String(plantillaId)) return;

      const previousSelectedId = state.selectedPlantillaId;
      const previousDefaultId = state.defaultPlantillaId;

      state.selectedPlantillaId = plantillaId;
      state.defaultPlantillaId = plantillaId;
      renderTemplates();
      updatePreview();

      try {
        const response = await API.Plantillas.establecerDefault(Number(plantillaId));
        state.defaultPlantillaId = response.default_plantilla_id || plantillaId;
      } catch (error) {
        state.selectedPlantillaId = previousSelectedId;
        state.defaultPlantillaId = previousDefaultId;
        renderTemplates();
        updatePreview();
        const message = error?.message || 'No se pudo guardar la plantilla predeterminada.';
        setPlantillaFeedback(message, 'error');
        mostrarToast(message, 'error');
      }
    }

    function renderTemplates() {
      const list = document.getElementById('templates-list');
      if (!list) return;

      list.innerHTML = state.plantillas.map((plantilla) => {
        const imageLabel = plantilla.imagen_path ? '<span class="template-image-badge"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>Imagen</span>' : '';
        return `
          <div class="template-item ${String(plantilla.id) === String(state.selectedPlantillaId) ? 'active' : ''}" data-id="${plantilla.id}">
            <div class="template-item-header">
              <svg class="template-item-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <span class="template-item-name">${escapeHtml(getPlantillaNombre(plantilla))}</span>
              ${imageLabel}
            </div>
            <div class="template-body">${escapeHtml(getPlantillaMensaje(plantilla))}</div>
            <div class="template-card-footer">
              <div>${String(plantilla.id) === String(state.selectedPlantillaId) ? '<span class="template-current">En uso en esta ruta</span>' : '<span class="template-card-meta">Disponible</span>'}</div>
              <div class="template-item-actions">
                <button class="template-action-btn edit" type="button" data-action="edit" data-id="${plantilla.id}" title="Editar plantilla">
                  <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                </button>
                <button class="template-action-btn delete" type="button" data-action="delete" data-id="${plantilla.id}" title="Eliminar plantilla">
                  <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      list.querySelectorAll('.template-item').forEach((card) => {
        card.addEventListener('click', (event) => {
          const action = event.target.closest('[data-action]');
          if (action) return;
          seleccionarPlantillaComoDefault(card.dataset.id);
        });
      });

      list.querySelectorAll('[data-action="edit"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const plantilla = state.plantillas.find((item) => String(item.id) === String(button.dataset.id));
          if (!plantilla) return;
          fillPlantillaForm(plantilla);
          togglePlantillaEditorModal(true);
        });
      });

      list.querySelectorAll('[data-action="delete"]').forEach((button) => {
        button.addEventListener('click', async (event) => {
          event.stopPropagation();
          await eliminarPlantilla(button.dataset.id);
        });
      });

      syncPlantillaActivaLabel();
    }

    async function loadTemplates() {
      const list = document.getElementById('templates-list');
      if (!list) return;

      try {
        const data = await API.Plantillas.listar();
        state.plantillas = data.datos || data.data || [];
        state.defaultPlantillaId = data.default_plantilla_id || data.defaultPlantillaId || null;

        if (!state.plantillas.length) {
          list.innerHTML = '<div class="empty-row">No hay plantillas disponibles.</div>';
          SharedUI.setText('plantilla-activa-label', 'Sin plantilla seleccionada');
          resetPlantillaForm();
          return;
        }

        const defaultPlantilla = state.defaultPlantillaId
          ? state.plantillas.find((item) => String(item.id) === String(state.defaultPlantillaId))
          : null;
        const selectedStillExists = state.selectedPlantillaId
          ? state.plantillas.some((item) => String(item.id) === String(state.selectedPlantillaId))
          : false;

        if (defaultPlantilla && (!state.selectedPlantillaId || !selectedStillExists)) {
          state.selectedPlantillaId = defaultPlantilla.id;
        } else if (!selectedStillExists) {
          state.selectedPlantillaId = state.plantillas[0].id;
        }

        if (state.editingPlantillaId) {
          const currentEditing = state.plantillas.find((item) => String(item.id) === String(state.editingPlantillaId));
          if (!currentEditing) resetPlantillaForm();
        }

        renderTemplates();
        updatePreview();
      } catch (_error) {
        list.innerHTML = '<div class="empty-row error-row">No se pudieron cargar las plantillas.</div>';
      }
    }

    function bindPlantillasModal() {
      const modal = document.getElementById('modal-plantillas');
      const editorModal = document.getElementById('modal-plantilla-editor');

      document.getElementById('btn-open-plantillas')?.addEventListener('click', () => toggleTemplatesModal(true));
      document.getElementById('btn-cerrar-plantillas')?.addEventListener('click', () => toggleTemplatesModal(false));
      document.getElementById('btn-cancelar-plantillas')?.addEventListener('click', () => toggleTemplatesModal(false));
      document.getElementById('btn-nueva-plantilla')?.addEventListener('click', () => {
        resetPlantillaForm();
        togglePlantillaEditorModal(true);
      });
      document.getElementById('btn-cancelar-edicion-plantilla')?.addEventListener('click', () => togglePlantillaEditorModal(false));
      document.getElementById('btn-cerrar-editor-plantilla')?.addEventListener('click', () => togglePlantillaEditorModal(false));

      modal?.addEventListener('click', (event) => {
        if (event.target === modal) toggleTemplatesModal(false);
      });
      editorModal?.addEventListener('click', (event) => {
        if (event.target === editorModal) togglePlantillaEditorModal(false);
      });

      document.getElementById('plantilla-modal-imagen')?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        const info = document.getElementById('plantilla-imagen-info');
        const fileCard = document.getElementById('file-card-preview');
        if (!file) return;
        try {
          state.templateImageBase64 = await optimizeImage(file);
          state.templateImageName = file.name;
          state.templateImageBorrar = false;

          if (info) info.textContent = 'Cambiar imagen';
          if (fileCard) {
            const nameEl = document.getElementById('file-card-name');
            const sizeEl = document.getElementById('file-card-size');
            if (nameEl) nameEl.textContent = file.name;
            if (sizeEl) sizeEl.textContent = formatFileSize(file.size);
            fileCard.style.display = 'flex';
          }

          const img = document.getElementById('file-card-img');
          if (img && state.templateImageBase64) {
            img.src = state.templateImageBase64;
            img.onload = () => {
              const dims = document.getElementById('file-card-dims');
              if (dims) dims.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
            };
          }

          updatePreview();
        } catch {
          mostrarToast('No se pudo procesar la imagen.', 'error');
        }
      });

      document.getElementById('btn-quitar-imagen-plantilla')?.addEventListener('click', () => {
        const input = document.getElementById('plantilla-modal-imagen');
        const info = document.getElementById('plantilla-imagen-info');
        const fileCard = document.getElementById('file-card-preview');
        state.templateImageBase64 = null;
        state.templateImageName = null;
        state.templateImageBorrar = true;
        if (input) input.value = '';
        if (info) info.textContent = 'Subir imagen';
        if (fileCard) {
          fileCard.style.display = 'none';
          const img = document.getElementById('file-card-img');
          if (img) { img.src = ''; img.style.display = 'block'; }
        }
        updatePreview();
      });

      document.getElementById('form-plantilla-modal')?.addEventListener('submit', async (event) => {
        event.preventDefault();

        const nombre = document.getElementById('plantilla-modal-nombre')?.value.trim();
        const mensaje = document.getElementById('plantilla-modal-mensaje')?.value.trim();
        if (!nombre || !mensaje) {
          setPlantillaFeedback('Completa el nombre y el mensaje de la plantilla.', 'error');
          return;
        }

        const payload = { nombre, mensaje };
        if (state.templateImageBase64) {
          payload.imagen_base64 = state.templateImageBase64;
          payload.imagen_nombre = state.templateImageName;
        } else if (state.templateImageBorrar) {
          payload.imagen_borrar = true;
        }

        const btnGuardar = document.getElementById('btn-guardar-plantilla-modal');
        setBtnLoading(btnGuardar, true, state.editingPlantillaId ? 'Guardando cambios...' : 'Guardando...');

        try {
          if (state.editingPlantillaId) {
            await API.Plantillas.actualizar(state.editingPlantillaId, payload);
          } else {
            await API.Plantillas.crear(payload);
          }

          await loadTemplates();
          const plantillaCoincidente = state.plantillas.find((item) =>
            getPlantillaNombre(item).trim().toLowerCase() === nombre.toLowerCase()
            && getPlantillaMensaje(item).trim() === mensaje
          );
          if (plantillaCoincidente) state.selectedPlantillaId = plantillaCoincidente.id;

          togglePlantillaEditorModal(false, false);
          renderTemplates();
          updatePreview();
        } catch (error) {
          setPlantillaFeedback(error?.message || 'No se pudo guardar la plantilla.', 'error');
        } finally {
          setBtnLoading(btnGuardar, false);
        }
      });
    }

    return {
      loadTemplates,
      renderTemplates,
      bindPlantillasModal,
      updatePreview,
      getPlantillaNombre,
      getPlantillaMensaje
    };
  };
})(window);
