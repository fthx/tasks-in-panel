//    Tasks in panel
//    GNOME Shell extension
//    @fthx 2026
//    Light style mode copied from @fmuellner GNOME official extension


import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import { AppMenu } from 'resource:///org/gnome/shell/ui/appMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Panel } from 'resource:///org/gnome/shell/ui/panel.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';


const ICON_SIZE = 18; // px
const UNFOCUSED_TASK_BUTTON_OPACITY = 128; // 0...255
const SHOW_DESKTOP_ICON_NAME = 'focus-windows-symbolic';
const FAVORITES_ICON_NAME = 'starred-symbolic';
const RECENT_APPS_ICON_NAME = 'document-open-recent-symbolic';

class MonitorPanels {
    constructor(settings) {
        this._settings = settings;
        this._panels = new Map();

        this._buildPanels();
    }

    _buildPanels() {
        this._destroyPanels();

        for (const monitor of Main.layoutManager.monitors) {
            if (monitor === Main.layoutManager.primaryMonitor)
                continue;

            this._panels.set(monitor, new MonitorPanel(monitor, this._settings));
        }
    }

    _destroyPanels() {
        for (const panel of this._panels.values())
            panel.destroy();

        this._panels.clear();
    }

    destroy() {
        this._destroyPanels();
    }
}

class MonitorPanel extends Panel {
    static {
        GObject.registerClass(this);
    }

    constructor(monitor, settings) {
        super();

        this._monitor = monitor;
        this._settings = settings;

        Main.layoutManager.panelBox.remove_child(this);

        Main.layoutManager.addChrome(this, {
            affectsStruts: true,
            trackFullscreen: true,
        });

        this._applyStyle();
        this._reposition();
    }

    _applyStyle() {
        if (this._settings?.get_boolean('yaru-panel'))
            this.add_style_class_name('panel-yaru-like');

        if (this._settings?.get_boolean('accent-panel'))
            this.add_style_class_name('panel-accent');

        if (this._settings?.get_boolean('use-background-color')) {
            const style = `background-color: ${this._settings?.get_string('background-color')}`;

            this.set_style(style);
            this.connectObject('style-changed', () => this.set_style(style), this);
        }
    }

    vfunc_get_preferred_width(_forHeight) {
        return this._monitor ? [0, this._monitor.width] : [0, 0];
    }

    _updatePanel() {
        // no duplicated system indicators
    }

    _reposition() {
        if (!this._monitor)
            return;

        this.set_position(this._monitor.x, this._monitor.y);
        this.set_width(this._monitor.width);
    }

    destroy() {
        Main.layoutManager.removeChrome(this);

        super.destroy();
    }
}


class LightStyleMode extends GObject.Object {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super();

        this._savedColorScheme = Main.sessionMode.colorScheme;
        this._updateColorScheme('prefer-light');
    }

    _updateColorScheme(scheme) {
        Main.sessionMode.colorScheme = scheme;
        St.Settings.get().notify('color-scheme');
    }

    destroy() {
        this._updateColorScheme(this._savedColorScheme);
    }
}

class ShowDesktopButton extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(0.5, null, true);

        this._makeButtonBox();

        if (this._clickGesture)
            this.remove_action(this._clickGesture);
        this._clickGesture = new Clutter.ClickGesture();
        this._clickGesture.connectObject('recognize', () => this._toggleAllWindows(), this);
        this.add_action(this._clickGesture);

        if (!Main.panel.statusArea['showDesktopButton'])
            Main.panel.addToStatusArea('showDesktopButton', this, -1);
    }

    _makeButtonBox() {
        this._box = new St.BoxLayout();

        this._icon = new St.Icon({ icon_name: SHOW_DESKTOP_ICON_NAME, style_class: 'system-status-icon' });
        this._box.add_child(this._icon);

        this.add_child(this._box);
    }

    _toggleAllWindows() {
        const activeWorkspace = global.workspace_manager.get_active_workspace();
        const allWindows = activeWorkspace?.list_windows() ?? [];
        const notAllWindowsMinimized = allWindows.some(window => !window?.minimized);

        if (notAllWindowsMinimized) {
            for (const window of allWindows) {
                if (!window?.minimized && window?.can_minimize())
                    window?.minimize();
            }
        } else {
            for (const window of allWindows)
                window?.unminimize();
        }
    }
}

class UserIdButton extends SystemIndicator {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super();

        this._addIndicator();

        const userId = new St.Label({ text: `${GLib.get_real_name()}  `, y_align: Clutter.ActorAlign.CENTER });
        this.add_child(userId);

        Main.panel.statusArea.quickSettings.addExternalIndicator(this);
    }
}

class FavoritesMenuButton extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(0.5);

        this._makeButtonBox();

        if (!Main.panel.statusArea['favoritesMenuButton'])
            Main.panel.addToStatusArea('favoritesMenuButton', this, 99, 'left');

        AppFavorites.getAppFavorites().connectObject('changed', () => this._updateFavorites(), this);
    }

    _makeButtonBox() {
        this._box = new St.BoxLayout();

        this._icon = new St.Icon({ icon_name: FAVORITES_ICON_NAME, style_class: 'system-status-icon' });
        this._box.add_child(this._icon);

        this.add_child(this._box);

        this._updateFavorites();
    }

    _updateFavorites() {
        this.menu?.removeAll();

        const favorites = AppFavorites.getAppFavorites().getFavorites() ?? [];

        for (const favorite of favorites) {
            const item = new PopupMenu.PopupImageMenuItem(favorite?.get_name(), favorite?.icon);
            this.menu?.addMenuItem(item);

            item.connect('activate', () => {
                if (favorite?.can_open_new_window())
                    favorite?.open_new_window(-1);
                else
                    favorite?.activate();
            });
        }
    }

    destroy() {
        this.menu?.removeAll();
        AppFavorites.getAppFavorites()?.disconnectObject(this);

        super.destroy();
    }
}

class RecentAppsMenuButton extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(globalRecentApps) {
        super(0.5);

        this._globalRecentApps = globalRecentApps;

        this._makeButtonBox();

        if (!Main.panel.statusArea['recentAppsMenuButton'])
            Main.panel.addToStatusArea('recentAppsMenuButton', this, 99, 'left');
    }

    _makeButtonBox() {
        this._box = new St.BoxLayout();

        this._icon = new St.Icon({ icon_name: RECENT_APPS_ICON_NAME, style_class: 'system-status-icon' });
        this._box.add_child(this._icon);

        this.add_child(this._box);
    }

    _updateRecentApps() {
        this.menu?.removeAll();

        const recentApps = this._globalRecentApps.recentApps ?? [];

        for (const app of recentApps) {
            const item = new PopupMenu.PopupImageMenuItem(app?.get_name(), app?.icon);
            this.menu?.addMenuItem(item);

            item.connect('activate', () => {
                if (app?.can_open_new_window())
                    app?.open_new_window(-1);
                else
                    app?.activate();
            });
        }
    }

    destroy() {
        this.menu?.removeAll();

        super.destroy();
    }
}

class WorkspacesBar extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(settings, isDynamicWorkspaces) {
        super(0.5, null, true);
        this.reactive = false;

        this._settings = settings;
        this._isDynamicWorkspaces = isDynamicWorkspaces;

        this._box = new St.BoxLayout();

        if (!this._isDynamicWorkspaces && this._settings?.get_boolean('show-plus-minus'))
            this._makeControlsBox();

        this.add_child(this._box);

        if (!Main.panel.statusArea['workspacesBarButton'])
            Main.panel.addToStatusArea('workspacesBarButton', this, 0, 'left');
    }

    _makeControlsBox() {
        this._controlsBox = new St.BoxLayout({ y_align: Clutter.ActorAlign.CENTER });
        this._controlsBox.add_style_class_name('plus-minus');

        this._plusButton = new St.Button({ label: '+' });
        this._minusButton = new St.Button({ label: '−' });

        this._controlsBox.add_child(this._plusButton);
        this._controlsBox.add_child(this._minusButton);

        this._plusButton.connect('clicked', () => this._addWorkspace());
        this._minusButton.connect('clicked', () => this._removeWorkspace());

        this._box.add_child(this._controlsBox);
    }

    _addWorkspace() {
        global.workspace_manager.append_new_workspace(false, global.get_current_time());
    }

    _removeWorkspace() {
        if (global.workspace_manager.n_workspaces > 1) {
            const activeWorkspace = global.workspace_manager.get_active_workspace();
            global.workspace_manager.remove_workspace(activeWorkspace, global.get_current_time());
        }
    }
}

class WorkspaceButton extends St.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(workspace, isDynamicWorkspaces) {
        super();

        this._workspace = workspace;
        this._isDynamicWorkspaces = isDynamicWorkspaces;

        this._makeButtonBox();

        this._updateIndex();
        this._updateFocus();

        this._connectSignals();
    }

    _connectSignals() {
        global.workspace_manager.connectObject(
            'active-workspace-changed', () => this._updateFocus(),
            'notify::n-workspaces', () => this._onWorkspaceRemoved(),
            this);
        this._workspace?.connectObject(
            'notify::workspace-index', () => this._updateIndex(),
            'notify::n-windows', () => this._updateOpacity(),
            this);

        this.connect('clicked', () => this._onClick());
    }

    _disconnectSignals() {
        global.workspace_manager.disconnectObject(this);
        this._workspace?.disconnectObject(this);
    }

    _makeButtonBox() {
        this._workspaceIndex = new St.Label({ reactive: true, track_hover: true, y_align: Clutter.ActorAlign.CENTER });
        this._workspaceIndex.add_style_class_name('workspace-button');

        this.add_child(this._workspaceIndex);
    }

    _onClick() {
        if (global.workspace_manager.get_active_workspace() === this._workspace)
            Main.overview.toggle();
        else if (this._workspace && this._isWorkspaceMapped())
            this._workspace.activate(global.get_current_time());
    }

    _updateFocus() {
        if (this._workspace?.active) {
            this._workspaceIndex?.remove_style_class_name('workspace-button-inactive');
            this._workspaceIndex?.add_style_class_name('workspace-button-active');
        } else {
            this._workspaceIndex?.remove_style_class_name('workspace-button-active');
            this._workspaceIndex?.add_style_class_name('workspace-button-inactive');
        }

        this._updateOpacity();
    }

    _updateOpacity() {
        if (this._workspace?.n_windows === 0 && !this._workspace?.active && !this._isDynamicWorkspaces)
            this._workspaceIndex?.add_style_class_name('workspace-button-no-windows');
        else
            this._workspaceIndex?.remove_style_class_name('workspace-button-no-windows');
    }

    _updateIndex() {
        if (this._workspace && this._isWorkspaceMapped())
            this._workspaceIndex.text = `${this._workspace.index() + 1}`;
    }

    _isWorkspaceMapped() {
        const n_workspaces = global.workspace_manager.n_workspaces;

        for (let index = 0; index < n_workspaces; index++) {
            if (global.workspace_manager.get_workspace_by_index(index) === this._workspace)
                return true;
        }

        return false;
    }

    _onWorkspaceRemoved() {
        if (!this._workspace || !this._isWorkspaceMapped())
            this.destroy();
    }

    destroy() {
        this._disconnectSignals();
        this.get_parent()?.remove_child(this);

        super.destroy();
    }
}

class TaskButton extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(taskSettings, globalRecentApps, panels, window) {
        super(0.5, null, true);

        this._taskSettings = taskSettings;
        this._globalRecentApps = globalRecentApps;
        this._panels = panels;
        this._window = window;

        this._makeButtonBox();
        this._insertButton();
        if (this._abort) {
            this.destroy();
            return;
        }

        this._updateApp();
        this._updateTitle();
        this._updateVisibility();

        this._connectSignals();
    }

    _connectSignals() {
        global.workspace_manager.connectObject('active-workspace-changed',
            () => this._updateVisibility(), GObject.ConnectFlags.AFTER, this);
        global.display.connectObject(
            'notify::focus-window', () => this._updateVisibility(), GObject.ConnectFlags.AFTER,
            'window-entered-monitor', (_display, _monitorIndex, window) => {
                if (window && window === this._window)
                    this._rehomeButton();
            }, GObject.ConnectFlags.AFTER,
            this);

        this._window?.connectObject(
            'notify::demands-attention', () => this._updateDemandsAttention(), GObject.ConnectFlags.AFTER,
            'notify::gtk-application-id', () => this._updateApp(), GObject.ConnectFlags.AFTER,
            'notify::skip-taskbar', () => this._updateVisibility(), GObject.ConnectFlags.AFTER,
            'notify::title', () => this._updateTitle(), GObject.ConnectFlags.AFTER,
            'notify::urgent', () => this._updateDemandsAttention(), GObject.ConnectFlags.AFTER,
            'notify::wm-class', () => this._updateApp(), GObject.ConnectFlags.AFTER,
            'unmanaging', () => this._animatedDestroy(), GObject.ConnectFlags.AFTER,
            'workspace-changed', () => this._updateVisibility(), GObject.ConnectFlags.AFTER,
            this);

        if (!this._taskSettings.showFocusedWindow)
            this.connect('notify::hover', () => this._onHover());

        if (this._clickGesture)
            this.remove_action(this._clickGesture);
        this._clickGesture = new Clutter.ClickGesture();
        this._clickGesture.connectObject('recognize', gesture => this._onClick(gesture), this);
        this.add_action(this._clickGesture);
    }

    _disconnectSignals() {
        global.workspace_manager.disconnectObject(this);
        global.display.disconnectObject(this);

        this._window?.disconnectObject(this);
        this._app?.disconnectObject(this);
    }

    _insertButton() {
        this._abort = true;

        this._side = this._taskSettings.centerTasks ? 'center' : 'left';
        this._windowId = this._window?.get_id();
        this._buttonId = `taskButton${this._windowId}`;
        const monitor = Main.layoutManager.monitors[this._window?.get_monitor()];

        if (this._windowId) {
            this._panel = this._panels.get(monitor) ?? Main.panel;

            if (!this._panel.statusArea[this._buttonId]) {
                this._panel.addToStatusArea(this._buttonId, this, 99, this._side);
                this._abort = false;
            }
        }
    }

    _rehomeButton() {
        const monitor = Main.layoutManager.monitors[this._window?.get_monitor()];
        const panel = this._panels.get(monitor) ?? Main.panel;
        if (panel === this._panel)
            return;

        delete this._panel.statusArea[this._buttonId];
        if (this.menu)
            this._panel.menuManager.removeMenu(this.menu);

        this._panel = panel;
        this._panel.addToStatusArea(this._buttonId, this, 99, this._side);
        if (this.menu)
            this._panel.menuManager.addMenu(this.menu);
    }

    _makeButtonBox() {
        this._box = new St.BoxLayout({ reactive: true, track_hover: true });
        if (!this._taskSettings.showFocusedWindow && !this._taskSettings.undecoratedTaskButtons)
            this._box.add_style_class_name('task-box');
        if (this._taskSettings.forceBoldTasks)
            this._box.add_style_class_name('task-force-bold');

        if ((this._taskSettings.showWindowTitle || this._taskSettings.showWindowApp)
            && this._taskSettings.buttonWidth > -1)
            this._box.set_style(`-st-natural-width: 9999px; max-width: ${this._taskSettings.buttonWidth}px;`);

        this._icon = new St.Icon({ fallback_gicon: null, icon_size: ICON_SIZE });
        this._box.add_child(this._icon);
        this._icon.visible = this._taskSettings.showWindowIcon;
        if (this._taskSettings.desaturateIcon) {
            this._icon.add_style_class_name('task-symbolic-icon');
            const desaturate = new Clutter.DesaturateEffect();
            this._icon.add_effect(desaturate);
        }

        this._title = new St.Label({ style_class: 'task-label', y_align: Clutter.ActorAlign.CENTER });
        this._box.add_child(this._title);
        this._title.visible = this._taskSettings.showWindowTitle;

        this._separator = new St.Label({ text: '—', style_class: 'task-label', y_align: Clutter.ActorAlign.CENTER });
        this._box.add_child(this._separator);
        this._separator.visible = this._taskSettings.showWindowApp && this._taskSettings.showWindowTitle;

        this._appName = new St.Label({ style_class: 'task-label', y_align: Clutter.ActorAlign.CENTER });
        this._box.add_child(this._appName);
        this._appName.visible = this._taskSettings.showWindowApp;

        this.add_child(this._box);

        this.setMenu(new AppMenu(this));
    }

    _toggleWindow() {
        if (!this._window)
            return;

        this._windowOnTop = null;

        if (!Main.overview.visible && this._windowIsOnActiveWorkspace && this._windowHasFocus) {
            if (this._window.can_minimize())
                this._window.minimize();
        } else
            Main.activateWindow(this._window);
    }

    _onClick(gesture) {
        const button = gesture?.get_button();

        switch (button) {
            case Clutter.BUTTON_PRIMARY:
                if (this._taskSettings.showFocusedWindow)
                    this.menu?.toggle();
                else
                    this._toggleWindow();
                break;
            case Clutter.BUTTON_SECONDARY:
                this.menu?.toggle();
                break;
            case Clutter.BUTTON_MIDDLE:
                if (this._app?.can_open_new_window())
                    this._app?.open_new_window(-1);
                Main.overview.hide();
                break;
        }
    }

    _onHover() {
        if (this._hoverTimeout) {
            GLib.source_remove(this._hoverTimeout);
            this._hoverTimeout = null;
        }

        if (!this._taskSettings.hoverRaiseWindow || Main.overview.visible || !Main.wm._canScroll)
            return;

        if (this.hover) {
            const monitorIndex = this._window?.get_monitor();
            const windows = this._window?.get_workspace()?.list_windows() ?? [];
            const monitorWindows = windows.filter(w => w.get_monitor() === monitorIndex);
            this._windowOnTop = global.display.sort_windows_by_stacking(monitorWindows)?.at(-1);

            this._hoverTimeout = GLib.timeout_add_once(GLib.PRIORITY_DEFAULT, this._taskSettings.hoverDelay, () => {
                if (this.hover)
                    this._window?.raise();
                this._hoverTimeout = null;
            });
        } else
            this._windowOnTop?.raise();
    }

    _updateApp() {
        if (this._window) {
            if (this._taskSettings.groupWindows)
                this._app?.disconnectObject(this);
            this._app = Shell.WindowTracker.get_default().get_window_app(this._window);
        }

        if (!this._app)
            return;

        const wmClass = this._window?.wm_class;
        const icon = wmClass?.startsWith('chrome') ? Gio.ThemedIcon.new(wmClass) : this._app.icon;
        this._icon.set_gicon(icon);

        this._appName.text = this._app.get_name() ?? '';

        this.menu?.setApp(this._app);

        if (this._taskSettings.showRecentAppsMenu && this._app.app_info) {
            const maxLength = this._taskSettings.recentAppsListLength ?? 8;
            this._globalRecentApps.recentApps = [
                this._app,
                ...this._globalRecentApps.recentApps.filter(a => a !== this._app),
            ].slice(0, maxLength);
        }

        if (this._taskSettings.groupWindows)
            this._app.connectObject('windows-changed', () => this._updateVisibility(), this);
    }

    _updateDemandsAttention() {
        if (this._taskSettings.showFocusedWindow || this._taskSettings.undecoratedTaskButtons)
            return;

        if (this._window?.demands_attention || this._window?.urgent) {
            this._box.add_style_class_name('task-box-demands-attention');
            this.visible = true;
        } else {
            this._box.remove_style_class_name('task-box-demands-attention');
            this._updateVisibility();
        }
    }

    _updateFocus() {
        const focusWindow = global.display.focus_window;
        this._windowHasFocus = this._window
            && (this._window === focusWindow || this._window === focusWindow?.get_transient_for());

        if (this._taskSettings.showFocusedWindow)
            return;

        const isFocused = this._windowIsOnActiveWorkspace && this._windowHasFocus;
        if (this._taskSettings.undecoratedTaskButtons)
            this._box.opacity = isFocused ? 255 : UNFOCUSED_TASK_BUTTON_OPACITY;
        else if (isFocused)
            this._box.add_style_class_name('task-box-focus');
        else
            this._box.remove_style_class_name('task-box-focus');
    }

    _updateTitle() {
        this._title.text = this._window?.title ?? '';
    }

    _updateVisibility() {
        const activeWorkspace = global.workspace_manager.get_active_workspace();
        this._windowIsOnActiveWorkspace = this._window?.located_on_workspace(activeWorkspace);

        if (this._taskSettings.groupWindows) {
            const appWindows = (this._app?.get_windows() ?? []).filter(w => w.window_type !== Meta.WindowType.MODAL_DIALOG);
            const appWindowsOnActiveWorkspace = appWindows?.filter(w => w.located_on_workspace(activeWorkspace));
            const candidateWindows = appWindowsOnActiveWorkspace?.length > 0 ? appWindowsOnActiveWorkspace : appWindows;
            const focusWindow = global.display.focus_window;
            const appWindowOnTop = focusWindow && candidateWindows?.includes(focusWindow)
                ? focusWindow
                : global.display.sort_windows_by_stacking(candidateWindows).at(-1);
            this._isAppWindowOnTop = this._window === appWindowOnTop || this._window?.get_transient_for() === appWindowOnTop;
        }

        this._updateFocus();

        this.visible = this._window && !this._window.skip_taskbar
            && (!this._taskSettings.showActiveWorkspace || this._windowIsOnActiveWorkspace)
            && (!this._taskSettings.showFocusedWindow || this._windowHasFocus)
            && (!this._taskSettings.groupWindows || this._isAppWindowOnTop);
    }

    _animatedDestroy() {
        if (this._taskSettings.animateOnClose) {
            this.opacity = 0;
            this._box.ease({
                width: 0,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: () => this.destroy(),
            });
        } else
            this.destroy();
    }

    destroy() {
        if (this._hoverTimeout)
            GLib.source_remove(this._hoverTimeout);
        this._hoverTimeout = null;

        this._disconnectSignals();

        super.destroy();
    }
}

class TasksInPanel extends GObject.Object {
    static {
        GObject.registerClass(this);
    }

    constructor(settings) {
        super();

        this._settings = settings;

        this._initSettings();
        this._initTaskBar();
    }

    _connectSignals() {
        global.display.connectObject('window-created',
            (_display, window) => this._makeTaskButton(window), this);

        if (this._settings?.get_boolean('scroll-panel')) {
            for (const panel of [Main.panel, ...this._panels.values()])
                panel.connectObject('scroll-event',
                    (_actor, event) => Main.wm.handleWorkspaceScroll(event), this);
        }
    }

    _disconnectSignals() {
        global.display.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);

        for (const panel of [Main.panel, ...this._panels.values()])
            panel.disconnectObject(this);
    }

    _initSettings() {
        const mutterSettings = new Gio.Settings({ schema_id: 'org.gnome.mutter' });
        this._isDynamicWorkspaces = mutterSettings?.get_boolean('dynamic-workspaces');

        if (this._settings?.get_boolean('multi-monitor'))
            this._monitorPanels = new MonitorPanels(this._settings);
        this._panels = this._monitorPanels?._panels ?? new Map();

        if (this._settings?.get_boolean('light-style'))
            this._lightStyleMode = new LightStyleMode();

        if (this._settings?.get_boolean('yaru-panel'))
            Main.panel.add_style_class_name('panel-yaru-like');

        if (this._settings?.get_boolean('accent-panel'))
            Main.panel.add_style_class_name('panel-accent');

        if (this._settings?.get_boolean('use-background-color')) {
            const style = `background-color: ${this._settings?.get_string('background-color')}`;

            Main.panel.set_style(style);
            Main.panel.connectObject('style-changed', () => Main.panel.set_style(style), this);
        }

        if (this._settings?.get_boolean('show-user-id'))
            this._userIdButton = new UserIdButton();

        if (this._settings?.get_boolean('move-date')) {
            this._moveDate(true);
            Main.panel._updatePanel();
        }

        if (!this._settings?.get_boolean('show-activities'))
            Main.panel.statusArea.activities?.hide();

        if (this._settings?.get_boolean('show-favorites-menu'))
            this._favoritesMenuButton = new FavoritesMenuButton();

        if (this._settings?.get_boolean('show-recent-apps-menu')) {
            this._globalRecentApps = { recentApps: [] };
            this._recentAppsMenuButton = new RecentAppsMenuButton(this._globalRecentApps);
        }

        if (this._settings?.get_boolean('show-workspaces-bar'))
            this._initWorkspacesBar();

        if (this._settings?.get_boolean('show-show-desktop'))
            this._showDesktopButton = new ShowDesktopButton();

        this._taskSettings = {
            centerTasks: this._settings?.get_boolean('center-tasks'),
            showFocusedWindow: this._settings?.get_boolean('show-focused-window'),
            hoverRaiseWindow: this._settings?.get_boolean('hover-raise-window'),
            hoverDelay: this._settings?.get_int('hover-delay'),
            undecoratedTaskButtons: this._settings?.get_boolean('undecorated-task-buttons'),
            showActiveWorkspace: this._settings?.get_boolean('show-active-workspace'),
            showWindowTitle: this._settings?.get_boolean('show-window-title'),
            showWindowApp: this._settings?.get_boolean('show-window-app'),
            showWindowIcon: this._settings?.get_boolean('show-window-icon'),
            desaturateIcon: this._settings?.get_boolean('desaturate-icon'),
            forceBoldTasks: this._settings?.get_boolean('force-bold-tasks'),
            buttonWidth: this._settings?.get_int('button-width'),
            groupWindows: this._settings?.get_boolean('group-windows'),
            showRecentAppsMenu: this._settings?.get_boolean('show-recent-apps-menu'),
            recentAppsListLength: this._settings?.get_int('recent-apps-list-length'),
            animateOnClose: this._settings?.get_boolean('animate-on-close'),
        };
    }

    _initTaskBar() {
        this._initTaskBarTimeout = GLib.timeout_add_once(GLib.PRIORITY_DEFAULT, 500, () => {
            this._makeTaskbar();

            this._initTaskBarTimeout = null;
        });
    }

    _initWorkspacesBar() {
        this._initWorkspacesBarTimeout = GLib.timeout_add_once(GLib.PRIORITY_DEFAULT, 500, () => {
            this._workspacesBar = new WorkspacesBar(this._settings, this._isDynamicWorkspaces);

            const workspacesNumber = global.workspace_manager.n_workspaces;

            for (let workspaceIndex = 0; workspaceIndex < workspacesNumber; workspaceIndex++)
                this._makeWorkspaceButton(workspaceIndex);

            global.workspace_manager.connectObject('workspace-added', (_wm, index) =>
                this._makeWorkspaceButton(index), this);

            this._initWorkspacesBarTimeout = null;
        });
    }

    _makeWorkspaceButton(index) {
        const workspace = global.workspace_manager.get_workspace_by_index(index);
        if (!workspace || !this._workspacesBar || !this._workspacesBar._box)
            return;

        for (const bin of this._workspacesBar._box.get_children()) {
            if (workspace === bin?._workspace)
                return;
        }

        this._workspacesBar._box.add_child(new WorkspaceButton(workspace, this._isDynamicWorkspaces));
    }

    _makeTaskbar() {
        const workspacesNumber = global.workspace_manager.n_workspaces;

        for (let workspaceIndex = 0; workspaceIndex < workspacesNumber; workspaceIndex++) {
            const workspace = global.workspace_manager.get_workspace_by_index(workspaceIndex);
            const windowsList = workspace?.list_windows() ?? [];
            const windowsListSorted = global.display.sort_windows_by_stacking(windowsList);

            for (const window of windowsListSorted) {
                if (!window.is_on_all_workspaces() || workspaceIndex === 0)
                    this._makeTaskButton(window);
            }
        }

        this._connectSignals();
    }

    _makeTaskButton(window) {
        if (!window || window.skip_taskbar || window.window_type === Meta.WindowType.MODAL_DIALOG)
            return;

        new TaskButton(this._taskSettings, this._globalRecentApps, this._panels, window);

        if (this._taskSettings.showRecentAppsMenu && !this._recentAppsMenuTimeout) {
            this._recentAppsMenuTimeout = GLib.idle_add_once(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._recentAppsMenuButton?._updateRecentApps();
                this._recentAppsMenuTimeout = null;
            });
        }
    }

    _moveDate(active) {
        const panel = Main.sessionMode.panel;

        if (active) {
            panel.center = panel.center.filter(item => item !== 'dateMenu');
            if (!panel.right.includes('dateMenu'))
                panel.right.unshift('dateMenu');
        } else {
            panel.right = panel.right.filter(item => item !== 'dateMenu');
            if (!panel.center.includes('dateMenu'))
                panel.center.unshift('dateMenu');
        }
    }

    _destroyTaskbar() {
        if (this._initTaskBarTimeout)
            GLib.source_remove(this._initTaskBarTimeout);
        this._initTaskBarTimeout = null;

        if (this._recentAppsMenuTimeout)
            GLib.source_remove(this._recentAppsMenuTimeout);
        this._recentAppsMenuTimeout = null;

        const panels = [Main.panel, ...(this._monitorPanels?._panels.values() ?? [])];
        for (const panel of panels) {
            for (const box of [panel._leftBox, panel._centerBox]) {
                for (const bin of box.get_children()) {
                    const button = bin?.child;

                    if (button && button instanceof TaskButton)
                        button.destroy();
                }
            }
        }
    }

    _destroyWorkspacesBar() {
        if (this._initWorkspacesBarTimeout)
            GLib.source_remove(this._initWorkspacesBarTimeout);
        this._initWorkspacesBarTimeout = null;

        this._workspacesBar?.destroy();
        this._workspacesBar = null;
    }

    _destroyItems() {
        this._userIdButton?.destroy();
        this._userIdButton = null;

        this._showDesktopButton?.destroy();
        this._showDesktopButton = null;

        this._favoritesMenuButton?.destroy();
        this._favoritesMenuButton = null;

        this._recentAppsMenuButton?.destroy();
        this._recentAppsMenuButton = null;

        this._destroyWorkspacesBar();
        this._destroyTaskbar();
    }

    destroy() {
        this._disconnectSignals();

        this._lightStyleMode?.destroy();
        this._lightStyleMode = null;

        Main.panel.remove_style_class_name('panel-yaru-like');
        Main.panel.remove_style_class_name('panel-accent');
        Main.panel.set_style(null);

        Main.panel.statusArea.activities?.show();
        this._moveDate(false);
        Main.panel._updatePanel();

        this._destroyItems();

        this._monitorPanels?.destroy();
        this._monitorPanels = null;

        this._globalRecentApps = null;
    }
}

export default class TasksInPanelExtension extends Extension {
    _restart() {
        if (this._restartTimeout)
            return;

        this._restartTimeout = GLib.idle_add_once(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._restartTimeout = null;

            this.disable();
            this.enable();
        });
    }

    enable() {
        this._settings = this.getSettings();
        this._settings?.connectObject('changed', () => this._restart(), this);

        this._mutterSettings = new Gio.Settings({ schema_id: 'org.gnome.mutter' });
        this._mutterSettings?.connectObject('changed::dynamic-workspaces', () => this._restart(), this);

        if (this._settings?.get_boolean('multi-monitor'))
            Main.layoutManager.connectObject('monitors-changed', () => this._restart(), this);

        this._tasksInPanel = new TasksInPanel(this._settings);
    }

    disable() {
        if (this._restartTimeout)
            GLib.source_remove(this._restartTimeout);
        this._restartTimeout = null;

        Main.layoutManager.disconnectObject(this);

        this._settings?.disconnectObject(this);
        this._settings = null;

        this._mutterSettings?.disconnectObject(this);
        this._mutterSettings = null;

        this._tasksInPanel?.destroy();
        this._tasksInPanel = null;
    }
}
