param([Parameter(Mandatory=$true)][string]$PrinterName,[Parameter(Mandatory=$true)][string]$FilePath)
$source=@'
using System; using System.Runtime.InteropServices;
public class MyGRawPrinter {
[StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
[DllImport("winspool.drv",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool OpenPrinter(string n,out IntPtr h,IntPtr d);
[DllImport("winspool.drv",SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
[DllImport("winspool.drv",SetLastError=true,CharSet=CharSet.Unicode)] static extern int StartDocPrinter(IntPtr h,int l,[In]DOCINFO d);
[DllImport("winspool.drv",SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
[DllImport("winspool.drv",SetLastError=true)] static extern bool StartPagePrinter(IntPtr h);
[DllImport("winspool.drv",SetLastError=true)] static extern bool EndPagePrinter(IntPtr h);
[DllImport("winspool.drv",SetLastError=true)] static extern bool WritePrinter(IntPtr h,IntPtr b,int c,out int w);
public static void Send(string printer,byte[] bytes){IntPtr h;if(!OpenPrinter(printer,out h,IntPtr.Zero))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());IntPtr p=IntPtr.Zero;try{var d=new DOCINFO{pDocName="MyG Etiquetas",pDataType="RAW"};if(StartDocPrinter(h,1,d)==0)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());try{StartPagePrinter(h);p=Marshal.AllocCoTaskMem(bytes.Length);Marshal.Copy(bytes,0,p,bytes.Length);int w;if(!WritePrinter(h,p,bytes.Length,out w)||w!=bytes.Length)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());EndPagePrinter(h);}finally{EndDocPrinter(h);}}finally{if(p!=IntPtr.Zero)Marshal.FreeCoTaskMem(p);ClosePrinter(h);}}
}
'@
Add-Type -TypeDefinition $source
[MyGRawPrinter]::Send($PrinterName,[IO.File]::ReadAllBytes($FilePath))
