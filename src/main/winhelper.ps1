# Assistant fenêtres de Smash Emu : incruste la fenêtre d'un émulateur externe dans la fenêtre Smash Emu
# et lui envoie des raccourcis clavier. Lit une commande par ligne sur l'entrée standard, répond une ligne.
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;

public static class SmashWin {
	delegate bool EnumProc(IntPtr h, IntPtr p);
	[DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr p);
	[DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
	[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
	[DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
	[DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
	[DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
	[DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
	[DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
	[DllImport("user32.dll")] static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hgt, bool repaint);
	[DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hgt, uint flags);
	[DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
	[DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
	[DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inputs, int size);
	[DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint type);
	[DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
	[DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
	[DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
	[DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr ctx);
	[DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
	[StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
	[StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk; public ushort scan; public uint flags; public uint time; public IntPtr extra; }
	[StructLayout(LayoutKind.Explicit, Size = 40)] struct INPUT { [FieldOffset(0)] public uint type; [FieldOffset(8)] public KEYBDINPUT ki; }

	const int GWL_STYLE = -16;
	const long WS_CHILD = 0x40000000, WS_POPUP = 0x80000000, WS_CAPTION = 0x00C00000, WS_THICKFRAME = 0x00040000, WS_SYSMENU = 0x00080000, WS_MINMAX = 0x00030000, WS_VISIBLE = 0x10000000;

	// Fenêtres visibles d'un processus : « handle|largeur|hauteur|possédée|classe|titre », la plus grande d'abord.
	// « Possédée » (fenêtre propriétaire) ou classe #32770 : boîte de dialogue de l'émulateur.
	public static string Find(uint pid) {
		var list = new List<string>();
		EnumWindows((h, p) => {
			uint wp; GetWindowThreadProcessId(h, out wp);
			if (wp == pid && IsWindowVisible(h)) {
				RECT r; GetWindowRect(h, out r);
				var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
				var cls = new StringBuilder(256); GetClassName(h, cls, 256);
				string owned = GetWindow(h, 4) != IntPtr.Zero ? "1" : "0";
				list.Add((r.R - r.L) * (r.B - r.T) + "|" + h.ToInt64() + "|" + (r.R - r.L) + "|" + (r.B - r.T) + "|" + owned + "|" + cls.ToString().Replace("|", " ") + "|" + sb.ToString().Replace("\n", " "));
			}
			return true;
		}, IntPtr.Zero);
		list.Sort((a, b) => long.Parse(b.Split('|')[0]).CompareTo(long.Parse(a.Split('|')[0])));
		var outp = new List<string>();
		foreach (var s in list) outp.Add(s.Substring(s.IndexOf('|') + 1));
		return string.Join(";;", outp);
	}

	// Rend la fenêtre enfant de Smash Emu, sans bordure, puis la place dans la zone de jeu.
	public static void Embed(long child, long parent, int x, int y, int w, int h) {
		var c = new IntPtr(child);
		long style = GetWindowLongPtr(c, GWL_STYLE).ToInt64();
		style &= ~(WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINMAX);
		style |= WS_CHILD | WS_VISIBLE;
		SetWindowLongPtr(c, GWL_STYLE, new IntPtr(style));
		SetParent(c, new IntPtr(parent));
		Move(child, x, y, w, h);
		ShowWindow(c, 5);
	}

	// Au premier plan des enfants (au-dessus de la surface de rendu de Chromium), puis repositionnée.
	public static void Move(long child, int x, int y, int w, int h) { SetWindowPos(new IntPtr(child), IntPtr.Zero, x, y, w, h, 0x0040 | 0x0020); }
	public static void Hide(long h) { ShowWindow(new IntPtr(h), 0); }
	public static void Focus(long h) { SetForegroundWindow(new IntPtr(h)); }
	public static string Title(long h) { var sb = new StringBuilder(512); GetWindowText(new IntPtr(h), sb, 512); return sb.ToString().Replace((char)10, (char)32).Replace((char)9, (char)32); }
	// Fenêtre principale au premier plan (la fenêtre Smash Emu même quand le jeu incrusté a le focus).
	public static long Foreground() { return GetAncestor(GetForegroundWindow(), 2).ToInt64(); }

	// Touches simulées (ex. « F10 », « SHIFT+F3 », « TAB:down »).
	public static void Keys(string spec) {
		bool onlyDown = spec.EndsWith(":down"), onlyUp = spec.EndsWith(":up");
		spec = spec.Replace(":down", "").Replace(":up", "");
		var parts = spec.Split('+');
		var codes = new List<ushort>();
		foreach (var p in parts) codes.Add(Vk(p));
		int size = Marshal.SizeOf(typeof(INPUT));
		if (!onlyUp) foreach (var k in codes) { SendInput(1, new[] { Key(k, false) }, size); System.Threading.Thread.Sleep(25); }
		if (onlyDown) return;
		System.Threading.Thread.Sleep(onlyUp ? 0 : 60);
		for (int i = codes.Count - 1; i >= 0; i--) SendInput(1, new[] { Key(codes[i], true) }, size);
		System.Threading.Thread.Sleep(30);
	}

	static INPUT Key(ushort vk, bool up) {
		var i = new INPUT(); i.type = 1; i.ki.vk = vk; i.ki.scan = (ushort)MapVirtualKey(vk, 0); i.ki.flags = up ? 2u : 0u; return i;
	}

	static ushort Vk(string n) {
		n = n.Trim().ToUpperInvariant();
		if (n.Length > 1 && n[0] == 'F') { int f; if (int.TryParse(n.Substring(1), out f)) return (ushort)(0x6F + f); }
		switch (n) {
			case "SHIFT": return 0x10; case "CTRL": return 0x11; case "ALT": return 0x12; case "TAB": return 0x09;
			case "ESC": return 0x1B; case "ENTER": return 0x0D; case "SPACE": return 0x20; case "PAUSE": return 0x13;
		}
		return (ushort)n[0];
	}

	// Capture de la zone d'une fenêtre : PNG, ou JPEG réduit à « width » pixels de large (vignettes).
	public static void Shot(long h, string path, int width) {
		// Coordonnées en pixels réels (écrans mis à l'échelle à 125 %, 150 %…) le temps de la capture.
		IntPtr old = IntPtr.Zero;
		try { old = SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { }
		try { ShotRaw(h, path, width); } finally { if (old != IntPtr.Zero) SetThreadDpiAwarenessContext(old); }
	}

	static void ShotRaw(long h, string path, int width) {
		RECT r; GetWindowRect(new IntPtr(h), out r);
		using (var bmp = new Bitmap(r.R - r.L, r.B - r.T)) {
			using (var g = Graphics.FromImage(bmp)) g.CopyFromScreen(r.L, r.T, 0, 0, bmp.Size);
			if (width <= 0) { bmp.Save(path, System.Drawing.Imaging.ImageFormat.Png); return; }
			int hh = Math.Max(1, bmp.Height * width / Math.Max(1, bmp.Width));
			using (var small = new Bitmap(width, hh)) {
				using (var g = Graphics.FromImage(small)) { g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic; g.DrawImage(bmp, 0, 0, width, hh); }
				small.Save(path, System.Drawing.Imaging.ImageFormat.Jpeg);
			}
		}
	}
}
"@
[Console]::Out.WriteLine('ready')
while ($true) {
	$line = [Console]::In.ReadLine()
	if ($null -eq $line) { break }
	$a = $line.Split("`t")
	try {
		$out = switch ($a[0]) {
			'find' { [SmashWin]::Find([uint32]$a[1]) }
			'embed' { [SmashWin]::Embed([int64]$a[1], [int64]$a[2], [int]$a[3], [int]$a[4], [int]$a[5], [int]$a[6]); 'ok' }
			'move' { [SmashWin]::Move([int64]$a[1], [int]$a[2], [int]$a[3], [int]$a[4], [int]$a[5]); 'ok' }
			'hide' { [SmashWin]::Hide([int64]$a[1]); 'ok' }
			'focus' { [SmashWin]::Focus([int64]$a[1]); 'ok' }
			'keys' { [SmashWin]::Keys($a[1]); 'ok' }
			'shot' { [SmashWin]::Shot([int64]$a[1], $a[2], [int]$(if ($a.Length -gt 3) { $a[3] } else { 0 })); 'ok' }
			'title' { [SmashWin]::Title([int64]$a[1]) }
			'foreground' { [SmashWin]::Foreground() }
			default { 'err commande inconnue' }
		}
		[Console]::Out.WriteLine("ok`t$out")
	} catch {
		[Console]::Out.WriteLine("err`t$($_.Exception.Message)")
	}
}
