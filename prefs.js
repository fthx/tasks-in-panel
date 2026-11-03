import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';


export default class TasksInPanelPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.add(this._buildGlobalPage(settings));
        window.add(this._buildIndicatorsPage(settings));
        window.add(this._buildTasksPage(settings));
    }

    _addSwitchRow(group, settings, key, title, subtitle) {
        const row = new Adw.SwitchRow({ title, subtitle: subtitle ?? '' });
        group.add(row);
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _addSpinRow(group, settings, key, title, adjustment, subtitle) {
        const row = new Adw.SpinRow({ title, subtitle: subtitle ?? '', adjustment });
        group.add(row);
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildColorRow(settings) {
        const row = new Adw.ActionRow({ title: 'Custom background color' });

        const colorButton = new Gtk.ColorDialogButton({
            valign: Gtk.Align.CENTER,
            dialog: new Gtk.ColorDialog({ with_alpha: true }),
        });

        const rgba = new Gdk.RGBA();
        rgba.parse(settings.get_string('background-color'));
        colorButton.rgba = rgba;

        colorButton.connect('notify::rgba',
            () => settings.set_string('background-color', colorButton.rgba.to_string()));

        row.add_suffix(colorButton);
        row.activatable_widget = colorButton;

        return row;
    }

    _buildGlobalPage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'Global',
            icon_name: 'view-list-symbolic',
        });

        const group = new Adw.PreferencesGroup();
        page.add(group);

        this._addSwitchRow(group, settings, 'light-style', 'Light style mode',
            'GNOME Shell follows the system dark/light setting.');
        this._addSwitchRow(group, settings, 'yaru-panel', 'Use normal font weight in the panel');
        this._addSwitchRow(group, settings, 'accent-panel', 'Use accent color',
            'Panel background uses the GNOME accent color.');
        this._addSwitchRow(group, settings, 'use-background-color', 'Use custom background color');

        group.add(this._buildColorRow(settings));

        this._addSwitchRow(group, settings, 'scroll-panel', 'Scroll on the panel to switch workspace');
        this._addSwitchRow(group, settings, 'multi-monitor', 'Multi-monitor support',
            'A task panel on each secondary monitor.\nTasks follow their window\'s monitor.');

        return page;
    }

    _buildIndicatorsPage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'Indicators',
            icon_name: 'view-list-symbolic',
        });

        const group = new Adw.PreferencesGroup();
        page.add(group);

        this._addSwitchRow(group, settings, 'show-user-id', 'Show user name');
        this._addSwitchRow(group, settings, 'show-show-desktop', 'Show desktop button',
            'Minimizes all windows when at least one is visible.\nRestores all windows when they are all minimized.');
        this._addSwitchRow(group, settings, 'move-date', 'Move the date menu to the right');
        this._addSwitchRow(group, settings, 'show-activities', 'Show activities button');
        this._addSwitchRow(group, settings, 'show-workspaces-bar', 'Show workspaces bar');
        this._addSwitchRow(group, settings, 'show-plus-minus', 'Show +/- to add/remove workspace',
            'Hidden when GNOME\'s dynamic workspaces option is active.\nMinus removes the active workspace.');
        this._addSwitchRow(group, settings, 'show-favorites-menu', 'Show favorites menu button');
        this._addSwitchRow(group, settings, 'show-recent-apps-menu', 'Show recent applications menu button');

        this._addSpinRow(group, settings, 'recent-apps-list-length',
            'Maximum number of recent applications',
            new Gtk.Adjustment({ lower: 1, upper: 20, step_increment: 1 }));

        this._addSwitchRow(group, settings, 'center-tasks', 'Move tasks to the center',
            'Tasks are aligned to the left by default.');

        return page;
    }

    _buildTasksPage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'Tasks',
            icon_name: 'view-list-symbolic',
        });

        const group = new Adw.PreferencesGroup();
        page.add(group);

        this._addSwitchRow(group, settings, 'show-window-icon', 'Show window icon');
        this._addSwitchRow(group, settings, 'show-window-title', 'Show window title');
        this._addSwitchRow(group, settings, 'show-window-app', 'Show application name');
        this._addSwitchRow(group, settings, 'force-bold-tasks', 'Force bold font weight in tasks',
            'Overrides the panel\'s normal font weight option.');
        this._addSwitchRow(group, settings, 'show-active-workspace', 'Show on active workspace only');
        this._addSwitchRow(group, settings, 'show-focused-window', 'Show focused window only',
            'Left-click opens the app menu instead of toggling the window.');
        this._addSwitchRow(group, settings, 'group-windows', 'Group by app',
            'Only the topmost window of each app is shown.\nOther windows are available from the app menu.');
        this._addSwitchRow(group, settings, 'middle-click-close', 'Close window on middle-click',
            'Replaces opening a new application window.');
        this._addSwitchRow(group, settings, 'hover-raise-window', 'Raise window on hover');

        this._addSpinRow(group, settings, 'hover-delay',
            'Hover delay before raising window (ms)',
            new Gtk.Adjustment({ lower: 0, upper: 1000, step_increment: 50 }));

        this._addSwitchRow(group, settings, 'undecorated-task-buttons', 'Undecorated buttons',
            'Unfocused buttons are dimmed.');
        this._addSwitchRow(group, settings, 'desaturate-icon', 'Monochrome icon',
            'Some apps do have a symbolic icon.');

        this._addSpinRow(group, settings, 'button-width',
            'Task button natural width (px)',
            new Gtk.Adjustment({ lower: -1, upper: 999, step_increment: 10 }),
            'Reduced if the available width is insufficient.\nSet to -1 to fit content.');

        this._addSwitchRow(group, settings, 'animate-on-close', 'Animate on close');

        return page;
    }
}
