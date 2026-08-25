import { getCurrentWindow } from "@tauri-apps/api/window";

export function WindowControls() {
  const win = getCurrentWindow();
  return (
    <div className="window-controls">
      <button className="wc-btn wc-close"    title="Hide [⌘W]" onClick={() => win.hide()} />
      <button className="wc-btn wc-minimize" title="Minimize" onClick={() => win.minimize()} />
      <button className="wc-btn wc-maximize" title="Zoom"     onClick={() => win.toggleMaximize()} />
    </div>
  );
}
