@echo off
rem Run ONCE as Administrator (right-click > Run as administrator).
rem Lets the iPad reach the Mosaic server on this PC. Only affects ports 3000 and 3443, only on Private networks.
netsh advfirewall firewall add rule name="Mosaic HTTP"  dir=in action=allow protocol=TCP localport=3000 profile=private
netsh advfirewall firewall add rule name="Mosaic HTTPS" dir=in action=allow protocol=TCP localport=3443 profile=private
echo.
echo Done. Make sure this PC's network is set to "Private" (Settings > Network and internet > Wi-Fi/Ethernet > your network).
pause
