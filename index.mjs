/**
 * dsh-plugin-model-manager — Host half.
 *
 * Owns exactly two things:
 *
 *   1. One volatile Config field, `disabled`, which is the plugin's persistent
 *      state: a list of provider ids the user switched off. A volatile field is
 *      what makes the entry appear in the settings document, so the browser half
 *      reads and writes it through the ordinary `remote.settings` namespace —
 *      no bespoke Remote namespace, no credentials-domain file.
 *
 *   2. A catalog filter: `sessionController.modelCatalog()` is the single Host
 *      answer behind the composer's model picker, and it is wrapped so a
 *      disabled provider's group never reaches the browser.
 *
 * Deliberate scope of "disabled": it hides models from the picker only. The
 * provider stays registered in the LLM registry, so an existing session (or the
 * deployment default) that already points at one of its models keeps working —
 * `sessionController.modelAvailable`, the settings page's provider directory
 * (`llm.listProviders` + `llm.listConfigurableProviders`) and real requests are
 * all untouched.
 *
 * Why a wrapper rather than a declared extension point: dsh 0.2.0-rc.1 exposes
 * no seam for narrowing the model catalog. The `llm` seam registers adapters and
 * the whole event map carries no catalog event; the only interception points are
 * the documented Cordis ones this file avoids needing. The wrapper resolves the
 * service through the documented `ctx.inject` face and restores the original
 * method when the plugin unloads, so it composes with anything mounted beside it.
 */

import z from "@deepseek-ai/schemastery";

/** Loader entry id; also the settings namespace the browser half reads. */
const name = "model-manager";

/**
 * Providers the switch never disables. The Models settings page decides whether
 * to render an account provider's row from the very catalog this filter narrows
 * (settings-models reads `session.modelCatalog` to compute `accountAvailable`),
 * so disabling it would hide its own switch. Exempting it keeps every switch
 * reachable at all times.
 */
const EXEMPT_PROVIDERS = new Set(["deepseek-account"]);

/**
 * Plugin Config. The settings document lists entries whose schema carries a
 * volatile field, so this declaration is also what registers the namespace the
 * browser half writes to.
 */
export const Config = z.object({
	disabled: z.array(z.string()).default([]).volatile(),
});

/**
 * Read the live disabled-provider set out of a resolved Config.
 * @param config - resolved plugin config; its volatile field is an accessor.
 * @returns provider ids to hide, exempt providers removed.
 */
function disabledProviders(config) {
	let raw;
	try {
		const field = config === null || config === undefined ? undefined : config.disabled;
		raw = field !== undefined && field !== null && typeof field.get === "function" ? field.get() : field;
	} catch (error) {
		// A config accessor that throws must never break the model picker.
		raw = undefined;
	}
	const list = Array.isArray(raw) ? raw : [];
	const disabled = new Set();
	for (const value of list) {
		if (typeof value === "string" && value.length > 0 && !EXEMPT_PROVIDERS.has(value)) disabled.add(value);
	}
	return disabled;
}

/**
 * Drop every disabled provider from one model catalog answer.
 * @param catalog - the Host catalog (groups, failures, routableProviders, default).
 * @param disabled - provider ids to hide.
 * @returns a shallow copy without those providers; the input when nothing is hidden.
 */
function hideDisabledProviders(catalog, disabled) {
	if (disabled.size === 0 || catalog === null || typeof catalog !== "object") return catalog;
	const next = Object.assign({}, catalog);
	if (Array.isArray(catalog.groups)) {
		next.groups = catalog.groups.filter((group) => !(group !== null && typeof group === "object" && disabled.has(group.id)));
	}
	if (Array.isArray(catalog.failures)) {
		next.failures = catalog.failures.filter((failure) => !(failure !== null && typeof failure === "object" && disabled.has(failure.id)));
	}
	if (Array.isArray(catalog.routableProviders)) {
		next.routableProviders = catalog.routableProviders.filter((id) => !disabled.has(id));
	}
	return next;
}

/**
 * Wrap `sessionController.modelCatalog` for the lifetime of this plugin.
 *
 * The Typert gateway resolves a Remote method by reading it off the service at
 * invocation time (`Reflect.get(callReceiver, implementation)`), so a prototype
 * wrapper is what every caller sees, including the browser's
 * `remote.session.modelCatalog` and the settings page's account check.
 *
 * @param ctx - plugin context.
 * @param config - resolved plugin config, read per request so a settings write applies at once.
 */
function installCatalogFilter(ctx, config) {
	ctx.inject(["sessionController"], (scope) => {
		const controller = scope.sessionController;
		const proto = Object.getPrototypeOf(controller);
		const original = proto.modelCatalog;
		if (typeof original !== "function") {
			scope.logger.warn("[model-manager] sessionController.modelCatalog is unavailable; disabled providers stay visible");
			return;
		}
		const patched = function modelCatalog() {
			const disabled = disabledProviders(config);
			return Promise.resolve(original.apply(this, arguments)).then((catalog) => hideDisabledProviders(catalog, disabled));
		};
		proto.modelCatalog = patched;
		scope.effect(() => () => {
			if (proto.modelCatalog === patched) proto.modelCatalog = original;
		});
		scope.logger.info("[model-manager] model catalog filter installed");
	});
}

/**
 * Opt out of the auto-generated Plugins-page card.
 *
 * `disabled` is a string array the generated form has no useful editor for, and
 * the real control lives on the Models page's provider cards. Presentation only:
 * the namespace still appears in `settings.describe()`, so the browser half can
 * read and write it.
 *
 * @param ctx - plugin context.
 */
function suppressGeneratedCard(ctx) {
	ctx.inject(["settings"], (child) => {
		child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
	});
}

/**
 * Host half entry point.
 * @param ctx - plugin context.
 * @param config - resolved Config (volatile accessors).
 */
function apply(ctx, config) {
	suppressGeneratedCard(ctx);
	installCatalogFilter(ctx, config);
}

const plugin = { name, Config, apply };

export { EXEMPT_PROVIDERS, apply, disabledProviders, hideDisabledProviders, installCatalogFilter, name, plugin, suppressGeneratedCard };
export default plugin;
