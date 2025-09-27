//    Tasks in panel
//    GNOME Shell extension
//    @fthx 2025


import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { AppMenu } from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';


const ICON_SIZE = 20; // px
const UNFOCUSED_OPACITY = 128; // 0...255

const TaskButton = GObject.registerClass(
    class TaskButton extends PanelMenu.Button {
        _init(window) {
            super._init();

            this._window = window;

            this.add_style_class_name('task-button');
            this._makeButtonBox();

            this._updateApp();
            this._updateVisibility();

            this._id = 'task-button-' + this._window;
            if (!Main.panel.statusArea[this._id])
                Main.panel.addToStatusArea(this._id, this, 99, 'left');

            this._connectSignals();
        }

        _connectSignals() {
            global.workspace_manager.connectObject('active-workspace-changed', this._updateVisibility.bind(this), this);

            Main.overview.connectObject(
                'shown', this._updateVisibility.bind(this),
                'hidden', this._updateVisibility.bind(this),
                this);

            this._window?.connectObject(
                'notify::appears-focused', this._updateFocus.bind(this), GObject.ConnectFlags.AFTER,
                'notify::demands-attention', this._updateDemandsAttention.bind(this),
                'notify::gtk-application-id', this._updateApp.bind(this), GObject.ConnectFlags.AFTER,
                'notify::skip-taskbar', this._updateVisibility.bind(this),
                'notify::urgent', () => this._updateDemandsAttention(),
                'notify::wm-class', this._updateApp.bind(this), GObject.ConnectFlags.AFTER,
                'unmanaging', this.destroy.bind(this),
                'workspace-changed', this._updateVisibility.bind(this), GObject.ConnectFlags.AFTER,
                this);

            this.connectObject(
                'notify::hover', this._onHover.bind(this),
                'button-press-event', (actor, event) => this._onClick(event),
                this);
        }

        _disconnectSignals() {
            global.workspace_manager.disconnectObject(this);
            Main.overview.disconnectObject(this);

            this._window?.disconnectObject(this);
        }

        _makeButtonBox() {
            this._box = new St.BoxLayout();

            this._icon = new St.Icon();
            this._icon.set_fallback_gicon(null);
            this._box.add_child(this._icon);

            this.add_child(this._box);

            this.setMenu(new AppMenu(this));
        }

        _toggleWindow() {
            this._windowOnTop = null;

            if (this._window?.has_focus()) {
                if (this._window?.can_minimize() && !Main.overview.visible)
                    this._window?.minimize();
            } else {
                this._window?.activate(global.get_current_time());
                this._window?.focus(global.get_current_time());
            }
            Main.overview.hide();
        }

        _onClick(event) {
            if (event?.get_button() == Clutter.BUTTON_PRIMARY) {
                this.menu?.close();

                this._toggleWindow();

                return Clutter.EVENT_STOP;
            }

            if (event?.get_button() == Clutter.BUTTON_MIDDLE) {
                this.menu?.close();

                if (this._app?.can_open_new_window())
                    this._app?.open_new_window(-1);
                Main.overview.hide();

                return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        }

        _onHover() {
            if (Main.overview.visible || !Main.wm._canScroll)
                return;

            if (this.get_hover()) {
                let monitor_index = this._window?.get_monitor();
                let monitor_windows = this._window?.get_workspace()
                    .list_windows()
                    .filter(w => !w.minimized && w.get_monitor() == monitor_index);
                let monitor_windows_sorted = global.display.sort_windows_by_stacking(monitor_windows);
                this._windowOnTop = monitor_windows_sorted?.at(-1);

                this._window?.raise();
            }
            else
                this._windowOnTop?.raise();
        }

        _updateWorkspace() {
            this._activeWorkspace = global.workspace_manager.get_active_workspace();
            this._windowIsOnActiveWorkspace = this._window?.located_on_workspace(this._activeWorkspace);
        }

        _updateFocus() {
            if (Main.overview.visible || this._window?.appears_focused)
                this.opacity = 255;
            else
                this.opacity = UNFOCUSED_OPACITY;
        }

        _updateDemandsAttention() {
            if (this._window?.demands_attention) {
                this.set_opacity(255);
                this.add_style_class_name('task-demands-attention');
                this.visible = true;
            } else {
                this.remove_style_class_name('task-demands-attention');
                this._updateVisibility();
            }
        }

        _updateApp() {
            if (this._window)
                this._app = Shell.WindowTracker.get_default().get_window_app(this._window);

            let wmClass = this._window?.wm_class;
            if (this._app) {
                if (wmClass && wmClass.startsWith('chrome'))
                    this._icon.set_gicon(Gio.Icon.new_for_string(wmClass));
                else
                    this._icon.set_gicon(this._app.icon);
            }

            this._icon.set_icon_size(ICON_SIZE);

            this.menu.setApp(this._app);
        }

        _updateVisibility() {
            this._updateFocus();
            this._updateWorkspace();

            this.visible = Main.overview.visible || (!this._window?.is_skip_taskbar() && this._windowIsOnActiveWorkspace);
        }

        destroy() {
            this._disconnectSignals();

            super.destroy();
        }
    });

const TaskBar = GObject.registerClass(
    class TaskBar extends GObject.Object {
        _init() {
            super._init();

            this._makeTaskbar();
        }

        _connectSignals() {
            global.display.connectObject('window-created', (display, window) => this._makeTaskButton(window), this);
            Main.panel.connectObject('scroll-event', (actor, event) => Main.wm.handleWorkspaceScroll(event), this);
        }

        _disconnectSignals() {
            global.display.disconnectObject(this);
            Main.panel.disconnectObject(this);
        }

        _makeTaskButton(window) {
            if (!window || window.is_skip_taskbar() || window.get_window_type() == Meta.WindowType.MODAL_DIALOG)
                return;

            new TaskButton(window);
        }

        _destroyTaskbar() {
            if (this._makeTaskbarTimeout) {
                GLib.Source.remove(this._makeTaskbarTimeout);
                this._makeTaskbarTimeout = null;
            }

            for (let bin of Main.panel._leftBox.get_children()) {
                let button = bin.child;

                if (button && button instanceof TaskButton) {
                    button.destroy();
                    button = null;
                }
            }
        }

        _makeTaskbar() {
            this._makeTaskbarTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                let workspacesNumber = global.workspace_manager.n_workspaces;

                for (let workspaceIndex = 0; workspaceIndex < workspacesNumber; workspaceIndex++) {
                    let workspace = global.workspace_manager.get_workspace_by_index(workspaceIndex);
                    let windowsList = workspace?.list_windows();

                    for (let window of windowsList)
                        this._makeTaskButton(window);
                }

                this._connectSignals();

                this._makeTaskbarTimeout = null;
                return GLib.SOURCE_REMOVE;
            });
        }

        destroy() {
            this._disconnectSignals();
            this._destroyTaskbar();
        }
    });

export default class TasksInPanelExtension {
    enable() {
        this._taskbar = new TaskBar();
    }

    disable() {
        this._taskbar?.destroy();
        this._taskbar = null;
    }
}
