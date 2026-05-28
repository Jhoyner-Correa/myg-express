(function initRutasDetalleTemplatesModule(global) {
  global.RutasDetalleTemplatesModule = function createRutasDetalleTemplatesModule({
    state,
    escapeHtml,
    mostrarToast,
    setBtnLoading,
    optimizeImage
  }) {
    let previewTypingTimer = null;

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
      const btnQuitar = document.getElementById('btn-quitar-imagen-plantilla');

      if (nombre) nombre.value = getPlantillaNombre(plantilla);
      if (mensaje) mensaje.value = getPlantillaMensaje(plantilla);
      if (title) title.textContent = 'Editar plantilla';
      if (saveBtn) saveBtn.textContent = 'Guardar cambios';

      state.templateImageBase64 = null;
      state.templateImageName = null;
      state.templateImageBorrar = false;

      if (imageInfo) imageInfo.textContent = plantilla.imagen_path ? 'Imagen guardada' : 'Sin imagen';
      if (btnQuitar) btnQuitar.style.display = plantilla.imagen_path ? 'inline-flex' : 'none';

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
      const btnQuitar = document.getElementById('btn-quitar-imagen-plantilla');

      form?.reset();
      if (imageInput) imageInput.value = '';
      if (imageInfo) imageInfo.textContent = 'Sin imagen';
      if (btnQuitar) btnQuitar.style.display = 'none';
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
      if (previewContactStatus) previewContactStatus.textContent = state.selectedSessionId ? 'en linea' : 'sin sesion elegida';

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
        imgWrap.innerHTML = selectedPlantilla?.imagen_path
          ? '<div class="wa-bubble-img-placeholder">🖼️ Imagen de plantilla</div>'
          : '';
        textEl.innerHTML = escapeHtml(finalMessage).replace(/\n/g, '<br>');
      }, 550);
    }

    async function eliminarPlantilla(id) {
      const plantilla = state.plantillas.find((item) => String(item.id) === String(id));
      const nombre = getPlantillaNombre(plantilla);

      if (!window.confirm(`Se eliminara la plantilla "${nombre}". Deseas continuar?`)) return;

      try {
        await API.Plantillas.eliminar(id);
        if (String(state.selectedPlantillaId) === String(id)) state.selectedPlantillaId = null;
        if (String(state.editingPlantillaId) === String(id)) resetPlantillaForm();
        await loadTemplates();
        renderTemplates();
        updatePreview();
        setPlantillaFeedback('Plantilla eliminada.', 'ok');
        mostrarToast('Plantilla eliminada.', 'success');
      } catch (error) {
        setPlantillaFeedback(error?.message || 'No se pudo eliminar la plantilla.', 'error');
      }
    }

    function renderTemplates() {
      const list = document.getElementById('templates-list');
      if (!list) return;

      list.innerHTML = state.plantillas.map((plantilla) => {
        const imageLabel = plantilla.imagen_path ? '<span class="template-image-badge">📎 Imagen</span>' : '';
        return `
          <div class="template-item ${String(plantilla.id) === String(state.selectedPlantillaId) ? 'active' : ''}" data-id="${plantilla.id}">
            <div class="template-item-head">
              <div>
                <div class="template-name">${escapeHtml(getPlantillaNombre(plantilla))} ${imageLabel}</div>
                <div class="template-body">${escapeHtml(getPlantillaMensaje(plantilla))}</div>
              </div>
              <div class="template-item-actions">
                <button class="template-action-btn edit" type="button" data-action="edit" data-id="${plantilla.id}" title="Editar plantilla">
                  <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                </button>
                <button class="template-action-btn delete" type="button" data-action="delete" data-id="${plantilla.id}" title="Eliminar plantilla">
                  <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                </button>
              </div>
            </div>
            <div class="template-card-footer">
              <div>${String(plantilla.id) === String(state.selectedPlantillaId) ? '<div class="template-current">En uso en esta ruta</div>' : '<div class="template-card-meta">Disponible para esta ruta</div>'}</div>
            </div>
          </div>
        `;
      }).join('');

      list.querySelectorAll('.template-item').forEach((card) => {
        card.addEventListener('click', (event) => {
          const action = event.target.closest('[data-action]');
          if (action) return;
          state.selectedPlantillaId = card.dataset.id;
          renderTemplates();
          updatePreview();
          setPlantillaFeedback('Plantilla seleccionada para esta ruta.', 'ok');
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

        if (!state.plantillas.length) {
          list.innerHTML = '<div class="empty-row">No hay plantillas disponibles.</div>';
          SharedUI.setText('plantilla-activa-label', 'Sin plantilla seleccionada');
          resetPlantillaForm();
          return;
        }

        if (!state.selectedPlantillaId) {
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
        const btnQuitar = document.getElementById('btn-quitar-imagen-plantilla');
        if (!file) return;
        try {
          state.templateImageBase64 = await optimizeImage(file);
          state.templateImageName = file.name;
          state.templateImageBorrar = false;
          if (info) info.textContent = file.name;
          if (btnQuitar) btnQuitar.style.display = 'inline-flex';
        } catch {
          mostrarToast('No se pudo procesar la imagen.', 'error');
        }
      });

      document.getElementById('btn-quitar-imagen-plantilla')?.addEventListener('click', () => {
        const input = document.getElementById('plantilla-modal-imagen');
        const info = document.getElementById('plantilla-imagen-info');
        const btnQuitar = document.getElementById('btn-quitar-imagen-plantilla');
        state.templateImageBase64 = null;
        state.templateImageName = null;
        state.templateImageBorrar = true;
        if (input) input.value = '';
        if (info) info.textContent = 'Sin imagen';
        if (btnQuitar) btnQuitar.style.display = 'none';
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
            setPlantillaFeedback('Plantilla actualizada correctamente.', 'ok');
          } else {
            await API.Plantillas.crear(payload);
            setPlantillaFeedback('Plantilla creada correctamente.', 'ok');
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
