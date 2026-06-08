/**
 * Plugin Loader & Registry
 * Manages the lifecycle and state of software plugins.
 */

class PluginLoader {
    constructor() {
        this.plugins = new Map();
        this.states = JSON.parse(localStorage.getItem('plugin_states') || '{}');
        this.allSettings = JSON.parse(localStorage.getItem('plugin_settings') || '{}');
    }

    register(id, plugin) {
        const storedSettings = this.allSettings[id] || {};
        this.plugins.set(id, {
            ...plugin,
            id,
            enabled: this.states[id] !== undefined ? this.states[id] : (plugin.defaultEnabled || false),
            settings: { ...plugin.settings, ...storedSettings }
        });
    }

    enable(id) {
        if (this.plugins.has(id)) {
            const plugin = this.plugins.get(id);
            plugin.enabled = true;
            this.states[id] = true;
            this.saveStates();
            if (plugin.onEnable) plugin.onEnable();
        }
    }

    disable(id) {
        if (this.plugins.has(id)) {
            const plugin = this.plugins.get(id);
            plugin.enabled = false;
            this.states[id] = false;
            this.saveStates();
            if (plugin.onDisable) plugin.onDisable();
        }
    }

    saveStates() {
        localStorage.setItem('plugin_states', JSON.stringify(this.states));

        const settingsToSave = {};
        this.plugins.forEach((plugin, id) => {
            settingsToSave[id] = plugin.settings;
        });
        localStorage.setItem('plugin_settings', JSON.stringify(settingsToSave));
    }

    getPlugin(id) {
        return this.plugins.get(id);
    }

    getAllPlugins() {
        return Array.from(this.plugins.values());
    }

    isEnabled(id) {
        const plugin = this.plugins.get(id);
        return plugin ? plugin.enabled : false;
    }

    // Hook execution helper
    executeHook(hookName, ...args) {
        const results = [];
        this.plugins.forEach(plugin => {
            if (plugin.enabled && plugin.hooks && typeof plugin.hooks[hookName] === 'function') {
                results.push(plugin.hooks[hookName](...args));
            }
        });
        return results;
    }
}

export const pluginLoader = new PluginLoader();
