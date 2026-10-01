/**
 * dsh-plugin-model-manager — Browser half.
 *
 * Two contributions:
 *
 *   1. `settings.models.provider-card` — one entry per provider settings
 *      namespace (the slot is keyed by `settingsNs`, which for every pi-ai route
 *      is the loader entry id, so a single registration serves every provider
 *      card on the Models page). The entry renders the enable switch.
 *
 *   2. The model picker's footer row. The model pill renders its OWN dropdown:
 *      `dsh-client-ui-model-selection` portals a `MenuSurface` straight into
 *      `document.body`, and the `/model` popupSelect shell renders another one in
 *      the composer overlay anchor. Neither declares a child slot, so the row is
 *      attached to whichever surface is open, found by the `aria-label` its own
 *      package publishes (the pill's dropdown, or the `/model` shell).
 *
 * State lives in the Host settings document: this half reads
 * `remote.settings.describe()` and writes `remote.settings.mutate()` against the
 * namespace the Host half's Config declares. A write makes the Host re-describe
 * the document, which is exactly the event `dsh-client-ui-model-selection`
 * already refreshes its model catalog on, so the picker updates live.
 *
 * Bootstrap discipline: apply() only defines closures and registers; every
 * contribution is wrapped so a missing neighbour degrades to a warning instead
 * of taking the browser half down with it.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-model-manager',
  factory(require) {
    var React = require('react');
    var primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    var Switch = primitives.Switch;
    var h = React.createElement;

    /** Locale namespace this half owns. */
    var NS = 'modelManager';
    /** Owner name used for the injected style tag, so unload removes it. */
    var PLUGIN_ID = 'dsh-plugin-model-manager';
    var STYLE_ID = PLUGIN_ID + '/style';
    /** Provider cards on the Models settings page. */
    var PROVIDER_CARD_SLOT = 'settings.models.provider-card';
    /** Settings section id `ui-settings-models` registers the Models page under. */
    var MODELS_SECTION_ID = 'models';
    /** Root slot whose store handle opens the settings dialog. */
    var SETTINGS_ENTRY_SLOT = 'sidebar.settings';
    /** Preferred settings namespace (the Host loader row id). */
    var NS_HINT = 'model-manager';
    /** Providers the switch never disables — mirrors the Host half's exemption. */
    var EXEMPT_PROVIDERS = ['deepseek-account'];
    /** Marker attribute on the injected footer row. */
    var FOOTER_FLAG = 'data-dsh-model-manager';
    /** Locale namespace of the package that owns the model picker surfaces. */
    var MODEL_NS = 'model';
    /** Locale namespace of the command popupSelect shell. */
    var COMMAND_NS = 'command';
    /**
     * Known `aria-label` values of the model picker surfaces, as fallbacks for
     * when a bound dictionary answers with the key instead of the copy.
     */
    var MODEL_SURFACE_LABELS = ['模型与推理等级', 'Model and reasoning effort', '/model 选项', '/model options'];
    /** Localized copy, also the source of truth when the locale seat is absent. */
    var dict = {
      zh: {
        'switch.label': '在模型选择中显示',
        'switch.enable': '启用该供应商',
        'switch.disable': '禁用该供应商',
        'switch.hintEnabled': '对话窗口的模型选择会列出其模型',
        'switch.hintDisabled': '对话窗口的模型选择不再列出其模型',
        'switch.exempt': '官方账号供应商始终启用',
        'switch.exemptHint': '它的供应商行由模型目录本身决定是否显示，因此不提供开关',
        'switch.readOnly': '当前 profile 不接受设置写入',
        'footer.open': '模型设置',
        'footer.openHint': '打开「模型」设置，管理模型供应商',
      },
      en: {
        'switch.label': 'Show in model picker',
        'switch.enable': 'Enable this provider',
        'switch.disable': 'Disable this provider',
        'switch.hintEnabled': 'The composer model picker lists its models',
        'switch.hintDisabled': 'The composer model picker hides its models',
        'switch.exempt': 'The official account provider stays enabled',
        'switch.exemptHint': 'Its settings row is shown from the model catalog itself, so no switch is offered',
        'switch.readOnly': 'This profile does not accept settings writes',
        'footer.open': 'Model settings',
        'footer.openHint': 'Open the Models settings and manage providers',
      },
    };
    /** Inline sliders glyph, drawn in the shared 16px one-pixel stroke style. */
    var FOOTER_ICON = "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1\" aria-hidden=\"true\"><path d=\"M2.5 5.25h11M2.5 10.75h11\"/><circle cx=\"5.75\" cy=\"5.25\" r=\"1.5\"/><circle cx=\"10.25\" cy=\"10.75\" r=\"1.5\"/></svg>";
    var CSS = ".dsh-mm-row{display:flex;align-items:center;gap:10px;}.dsh-mm-row-text{display:flex;flex-direction:column;gap:2px;min-width:0;}.dsh-mm-row-label{font-size:13px;line-height:18px;color:var(--dsw-alias-label-primary);}.dsh-mm-row-hint{font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary);}.dsh-mm-footer{box-sizing:border-box;display:flex;flex:none;align-items:center;gap:6px;width:auto;min-width:100%;margin-top:3px;padding:6px 7px;border:0;border-top:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;text-align:left;cursor:pointer;outline:none;}.dsh-mm-footer:hover,.dsh-mm-footer:focus-visible{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}.dsh-mm-footer svg{width:14px;height:14px;flex:none;}";
    /** Shared empty lookup, so an idle snapshot keeps a stable identity. */
    var NO_DISABLED = new Set();

    // ------------------------------------------------------------------ style
    /** Install the plugin's stylesheet once, tagged so unload removes it. */
    function injectStyle() {
      if (typeof document === 'undefined') return;
      if (document.getElementById(STYLE_ID) !== null) return;
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.setAttribute('data-plugin', PLUGIN_ID);
      style.setAttribute('data-plugin-css', STYLE_ID);
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    // ---------------------------------------------------------------- locale
    /**
     * Translate one of this half's own keys, with the local table as fallback.
     * @param ctx - client root context.
     * @returns translate(key) string function.
     */
    function translateOf(ctx) {
      var bound = null;
      try {
        bound = ctx.locale.bind(NS);
      } catch (error) {
        bound = null;
      }
      return function translate(key) {
        if (typeof bound === 'function') {
          try {
            var text = bound(key);
            if (typeof text === 'string' && text.length > 0 && text !== key) return text;
          } catch (error) {
            // Fall through to the local table.
          }
        }
        var tag = null;
        try {
          var snapshot = ctx.locale.getSnapshot();
          tag = snapshot ? snapshot.active : null;
        } catch (error) {
          tag = null;
        }
        var table = String(tag === null || tag === undefined ? '' : tag).toLowerCase().indexOf('zh') === 0 ? dict.zh : dict.en;
        var value = table[key] !== undefined ? table[key] : dict.en[key];
        return typeof value === 'string' ? value : key;
      };
    }

    /**
     * Read one key out of another package's dictionary, for surface matching.
     * @param ctx - client root context.
     * @param ns - owning package's locale namespace.
     * @param key - dictionary key.
     * @param vars - optional interpolation values.
     * @returns the localized string, or null when the namespace is unavailable.
     */
    function readForeign(ctx, ns, key, vars) {
      try {
        var bound = ctx.locale.bind(ns);
        var text = vars === undefined ? bound(key) : bound(key, vars);
        if (typeof text === 'string' && text.length > 0 && text !== key) return text;
      } catch (error) {
        // The owning package may be unmounted; the known-copy list still applies.
      }
      return null;
    }

    // ----------------------------------------------------------------- state
    /**
     * The plugin's shared client state: the persisted disabled list plus the
     * settings revision a write is checked against.
     * @param ctx - client root context, carrying the `remote.settings` namespace.
     * @returns store face plus refresh/toggle operations.
     */
    function createManager(ctx) {
      var snap = { ready: false, writable: false, ns: null, revision: 0, disabled: NO_DISABLED, error: null };
      var listeners = new Set();
      function publish() {
        listeners.forEach(function (listener) {
          try {
            listener();
          } catch (error) {
            console.warn('[model-manager] state listener failed:', error);
          }
        });
      }
      function put(next) {
        snap = next;
        publish();
      }
      var store = {
        getSnapshot: function () {
          return snap;
        },
        getServerSnapshot: function () {
          return snap;
        },
        subscribe: function (listener) {
          listeners.add(listener);
          return function () {
            listeners.delete(listener);
          };
        },
      };
      /** Pick this plugin's namespace out of a described settings document. */
      function namespaceOf(view) {
        var rows = view !== null && typeof view === 'object' && Array.isArray(view.namespaces) ? view.namespaces : [];
        for (var i = 0; i < rows.length; i += 1) {
          if (rows[i] !== null && typeof rows[i] === 'object' && rows[i].ns === NS_HINT) return rows[i];
        }
        for (var j = 0; j < rows.length; j += 1) {
          var row = rows[j];
          if (row !== null && typeof row === 'object' && row.value !== null && typeof row.value === 'object' && Array.isArray(row.value.disabled)) return row;
        }
        return null;
      }
      /** Re-read the settings document and publish the disabled set. */
      async function refresh() {
        var response;
        try {
          response = await ctx.remote.settings.describe();
        } catch (error) {
          console.warn('[model-manager] settings describe failed:', error);
          put({ ready: false, writable: false, ns: null, revision: 0, disabled: NO_DISABLED, error: 'describe-failed' });
          return;
        }
        if (response === null || response === undefined || response.ok !== true) {
          put({ ready: false, writable: false, ns: null, revision: 0, disabled: NO_DISABLED, error: 'describe-refused' });
          return;
        }
        var view = response.value === null || response.value === undefined ? {} : response.value;
        var target = namespaceOf(view);
        if (target === null) {
          put({ ready: false, writable: false, ns: null, revision: 0, disabled: NO_DISABLED, error: 'namespace-missing' });
          return;
        }
        var raw = Array.isArray(target.value.disabled) ? target.value.disabled : [];
        var disabled = new Set();
        for (var i = 0; i < raw.length; i += 1) {
          if (typeof raw[i] === 'string' && raw[i].length > 0) disabled.add(raw[i]);
        }
        put({
          ready: true,
          writable: view.writable !== false,
          ns: target.ns,
          revision: typeof target.revision === 'number' ? target.revision : 0,
          disabled: disabled,
          error: null,
        });
      }
      /**
       * Flip one provider and re-read the document.
       * @param provider - provider id stored in the disabled list.
       * @param enabled - the switch's new value.
       */
      async function toggle(provider, enabled) {
        if (typeof provider !== 'string' || provider.length === 0) return;
        if (EXEMPT_PROVIDERS.indexOf(provider) >= 0) return;
        if (snap.ready !== true || snap.ns === null || snap.writable !== true) return;
        var next = new Set(snap.disabled);
        if (enabled === true) next.delete(provider);
        else next.add(provider);
        var value = Array.from(next).sort();
        try {
          var response = await ctx.remote.settings.mutate(snap.ns, [{ op: 'set', path: ['disabled'], value: value }], snap.revision);
          if (response === null || response === undefined || response.ok !== true) {
            console.warn('[model-manager] settings write refused:', response && response.error ? response.error.message : response);
          }
        } catch (error) {
          console.warn('[model-manager] settings write failed:', error);
        }
        await refresh();
      }
      return { store: store, refresh: refresh, toggle: toggle };
    }

    // -------------------------------------------------- open the Models page
    /**
     * Open the built-in settings dialog on the Models section.
     *
     * `sidebar.settings` is registered with a root-scope store seat whose actions
     * are the dialog's own (`open`, `close`, `select`, `openSection`). The slot
     * ledger exposes each entry's options, so the seat is reachable from outside
     * without importing the settings package's runtime values.
     *
     * @param ctx - client root context.
     * @returns whether a dialog action was invoked.
     */
    function openModelsSettings(ctx) {
      try {
        var entries = ctx.slots.entries(SETTINGS_ENTRY_SLOT);
        for (var i = 0; i < entries.length; i += 1) {
          var entry = entries[i];
          if (entry === null || entry === undefined) continue;
          // The slot core keeps a store seat on the entry itself — only key, id,
          // order, label and priority live under `options` — so both shapes are
          // read here.
          var handle = entry.store !== undefined && entry.store !== null
            ? entry.store
            : entry.options === undefined || entry.options === null ? null : entry.options.store;
          if (handle === null || handle === undefined || typeof handle.create !== 'function') continue;
          var instance = handle.create();
          var actions = instance === null || instance === undefined ? null : instance.actions;
          if (actions === null || actions === undefined) continue;
          if (typeof actions.openSection === 'function') {
            actions.openSection(MODELS_SECTION_ID);
            return true;
          }
          if (typeof actions.open === 'function') {
            actions.open();
            return true;
          }
        }
        console.warn('[model-manager] no settings shell store among ' + entries.length + ' "' + SETTINGS_ENTRY_SLOT + '" entries');
      } catch (error) {
        console.warn('[model-manager] opening the settings dialog failed:', error);
      }
      return false;
    }

    // ------------------------------------------------------- provider switch
    /**
     * One provider card's enable switch; rendered once per provider row.
     * @param props - slot props (`provider` row entry) plus the injected face.
     * @returns the switch row, or null while the state is unknown.
     */
    function ProviderSwitch(props) {
      var t = props.t;
      var row = props.provider;
      var state = props.useModelManager(function (value) {
        return value;
      });
      var provider = row !== null && row !== undefined && typeof row.provider === 'string' ? row.provider : null;
      if (provider === null || state.ready !== true) return null;
      var exempt = EXEMPT_PROVIDERS.indexOf(provider) >= 0;
      var enabled = !state.disabled.has(provider);
      var locked = exempt || state.writable !== true;
      var label = t(exempt ? 'switch.exempt' : enabled ? 'switch.disable' : 'switch.enable');
      var title = exempt ? t('switch.exemptHint') : state.writable !== true ? t('switch.readOnly') : undefined;
      return h(
        'div',
        { className: 'dsh-mm-row', 'data-provider': provider },
        h(Switch, {
          checked: exempt ? true : enabled,
          disabled: locked,
          label: label,
          title: title,
          onChange: function (next) {
            if (locked !== true) void props.toggleProvider(provider, next);
          },
        }),
        h(
          'span',
          { className: 'dsh-mm-row-text' },
          h('span', { className: 'dsh-mm-row-label' }, t('switch.label')),
          h('span', { className: 'dsh-mm-row-hint' }, t(enabled ? 'switch.hintEnabled' : 'switch.hintDisabled')),
        ),
      );
    }

    /**
     * Register one provider-card entry per declared settings namespace.
     * @param scope - client context carrying `remote.llm`.
     * @param managerFace - inject face handed to every switch component.
     * @returns the provider-directory refresher.
     */
    function installProviderCards(scope, managerFace) {
      var ctx = scope;
      var keys = [];
      var keyListeners = new Set();
      function publishKeys(next) {
        keys = next;
        keyListeners.forEach(function (listener) {
          try {
            listener();
          } catch (error) {
            console.warn('[model-manager] provider key listener failed:', error);
          }
        });
      }
      function refreshKeys() {
        return Promise.resolve(ctx.remote.llm.listConfigurableProviders()).then(function (response) {
          var entries = response !== null && response !== undefined && response.ok === true && Array.isArray(response.value) ? response.value : [];
          var seen = new Set();
          for (var i = 0; i < entries.length; i += 1) {
            var nsKey = entries[i] !== null && entries[i] !== undefined ? entries[i].settingsNs : null;
            if (typeof nsKey === 'string' && nsKey.length > 0) seen.add(nsKey);
          }
          publishKeys(Array.from(seen).sort());
        }).catch(function (error) {
          console.warn('[model-manager] provider directory failed:', error);
        });
      }
      try {
        ctx.slots.inject(PROVIDER_CARD_SLOT, function () {
          var state = { disposed: false, registrations: new Map() };
          function sync() {
            if (state.disposed === true) return;
            state.registrations.forEach(function (dispose, key) {
              if (keys.indexOf(key) < 0) {
                dispose();
                state.registrations.delete(key);
              }
            });
            keys.forEach(function (key) {
              if (state.registrations.has(key)) return;
              try {
                state.registrations.set(key, ctx.slots.register({
                  name: PROVIDER_CARD_SLOT,
                  key: key,
                  locale: NS,
                  inject: function () {
                    return managerFace;
                  },
                }, ProviderSwitch));
              } catch (error) {
                console.warn('[model-manager] provider card for "' + key + '" was not registered:', error);
              }
            });
          }
          keyListeners.add(sync);
          sync();
          void refreshKeys();
          return function () {
            state.disposed = true;
            keyListeners.delete(sync);
            state.registrations.forEach(function (dispose) {
              dispose();
            });
            state.registrations.clear();
          };
        });
      } catch (error) {
        console.warn('[model-manager] settings provider-card slot unavailable:', error);
      }
      return refreshKeys;
    }

    // ---------------------------------------------------- model picker footer
    /**
     * The model picker surface currently open, matched by its own aria-label.
     *
     * Both candidate surfaces are `MenuSurface` roots — the model pill's dropdown
     * (portaled into `document.body`) and the `/model` popupSelect shell (rendered
     * in the composer overlay anchor) — and both are unmounted while closed, so a
     * matching node means "this picker is open". The newest match wins.
     *
     * @param labels - accepted aria-label values.
     * @returns the surface element, or null.
     */
    function openModelPicker(labels) {
      if (typeof document === 'undefined') return null;
      var surfaces = document.querySelectorAll('[data-menu-material="translucent"]');
      for (var i = surfaces.length - 1; i >= 0; i -= 1) {
        var surface = surfaces[i];
        var aria = surface === null || surface.getAttribute === undefined ? null : surface.getAttribute('aria-label');
        if (aria === null) continue;
        for (var j = 0; j < labels.length; j += 1) {
          if (labels[j] === aria) return surface;
        }
      }
      return null;
    }

    /**
     * Keep a "模型设置" row at the bottom of the open model picker.
     *
     * The row is plain DOM inside a foreign React tree: it is only ever appended
     * (React appends its own later children after it), and a childList observer
     * re-appends it when a pane switch puts a new sibling behind it. The click
     * closes the picker first by dispatching Escape, which travels the React tree
     * from inside the portal up to the pill's own key handler.
     *
     * @param ctx - client root context.
     */
    function installModelPickerFooter(ctx) {
      if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return;
      var t = translateOf(ctx);
      var labels = MODEL_SURFACE_LABELS.slice();
      var fromModel = readForeign(ctx, MODEL_NS, 'menu.aria');
      if (fromModel !== null && labels.indexOf(fromModel) < 0) labels.push(fromModel);
      var fromCommand = readForeign(ctx, COMMAND_NS, 'overlay.aria', { command: 'model' });
      if (fromCommand !== null && labels.indexOf(fromCommand) < 0) labels.push(fromCommand);
      var surface = null;
      var footer = null;
      var surfaceObserver = null;
      var scheduled = false;
      function keepLast() {
        if (surface !== null && footer !== null && surface.lastElementChild !== footer) surface.appendChild(footer);
      }
      function detach() {
        if (surfaceObserver !== null) {
          surfaceObserver.disconnect();
          surfaceObserver = null;
        }
        if (footer !== null && footer.parentNode !== null) footer.parentNode.removeChild(footer);
        footer = null;
        surface = null;
      }
      function closePicker() {
        if (surface === null || typeof KeyboardEvent !== 'function') return;
        try {
          surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        } catch (error) {
          console.warn('[model-manager] closing the model picker failed:', error);
        }
      }
      function attach(next) {
        surface = next;
        footer = document.createElement('button');
        footer.type = 'button';
        footer.className = 'dsh-mm-footer';
        footer.tabIndex = -1;
        footer.setAttribute(FOOTER_FLAG, 'settings-entry');
        footer.innerHTML = FOOTER_ICON + '<span class="dsh-mm-footer-text"></span>';
        var label = footer.querySelector('.dsh-mm-footer-text');
        if (label !== null) label.textContent = t('footer.open');
        footer.title = t('footer.openHint');
        footer.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          closePicker();
          var opened = false;
          try {
            opened = openModelsSettings(ctx) === true;
          } catch (error) {
            console.warn('[model-manager] the settings action failed:', error);
          }
          if (opened !== true) console.warn('[model-manager] the Models settings section could not be opened');
        });
        surface.appendChild(footer);
        surfaceObserver = new MutationObserver(keepLast);
        surfaceObserver.observe(surface, { childList: true });
      }
      function sync() {
        try {
          var next = openModelPicker(labels);
          if (next === null) {
            detach();
            return;
          }
          if (next === surface && footer !== null) {
            keepLast();
            return;
          }
          detach();
          attach(next);
        } catch (error) {
          console.warn('[model-manager] model picker footer failed:', error);
        }
      }
      function schedule() {
        if (scheduled === true) return;
        scheduled = true;
        var run = function () {
          scheduled = false;
          sync();
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else setTimeout(run, 0);
      }
      // aria-expanded catches the pill toggling; the childList stream catches the
      // portal mount and unmount of the dropdown and of the popupSelect shell.
      var observer = new MutationObserver(schedule);
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-expanded'] });
      ctx.effect(function () {
        return function () {
          observer.disconnect();
          detach();
        };
      });
      sync();
    }

    // ------------------------------------------------------------- bootstrap
    return {
      // Only the seats both contributions need are required; the provider
      // directory is mounted in an optional child scope below, so a deployment
      // without it loses the switch instead of the whole browser half.
      inject: ['slots', 'locale', 'remote', 'remote.settings'],
      apply(ctx) {
        try {
          ctx.effect(function () {
            return ctx.locale.register(NS, dict);
          }, 'model-manager: dictionaries');
        } catch (error) {
          console.warn('[model-manager] locale registration failed:', error);
        }
        injectStyle();
        var manager = createManager(ctx);
        var managerFace = {
          hooks: { modelManager: manager.store },
          toggleProvider: function (provider, enabled) {
            void manager.toggle(provider, enabled);
          },
        };
        var refreshProviderKeys = function () {};
        ctx.inject(['remote.llm'], function (child) {
          refreshProviderKeys = installProviderCards(child, managerFace);
        });
        installModelPickerFooter(ctx);
        void manager.refresh();
        ctx.effect(function () {
          var off = ctx.remote.$on('settings/document-updated', function () {
            void manager.refresh();
            void refreshProviderKeys();
          });
          return function () {
            off();
          };
        }, 'model-manager: settings invalidations');
      },
    };
  },
});
