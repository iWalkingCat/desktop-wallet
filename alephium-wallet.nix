{ lib, stdenv , fetchurl , appimageTools , makeWrapper , electron }:

stdenv.mkDerivation rec {
  pname = "alephium-wallet";
  version = "1.5.0-rc.0";

  src = fetchurl {
    url = "https://github.com/alephium/desktop-wallet/releases/download/v${version}/Alephium-${version}.AppImage";
    sha256 = "hMfMJcpPJWpptFN47FO8KkDsdoS6Ko1svc7vBcxOKRE=";

    name = "${pname}-${version}.AppImage";
  };

  appimageContents = appimageTools.extractType2 {
    name = "${pname}-${version}";
    inherit src;
  };

  dontUnpack = true;
  dontConfigure = true;
  dontBuild = true;

  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall

    mkdir -p $out/bin $out/share/${pname} $out/share/applications

    cp -a ${appimageContents}/{locales,resources} $out/share/${pname}
    cp -a ${appimageContents}/${pname}.desktop $out/share/applications/${pname}.desktop
    cp -a ${appimageContents}/usr/share/icons $out/share

    substituteInPlace $out/share/applications/${pname}.desktop \
      --replace 'Exec=AppRun' 'Exec=${pname}'

    runHook postInstall
  '';

  postFixup = ''
    makeWrapper ${electron}/bin/electron $out/bin/${pname} \
      --add-flags $out/share/${pname}/resources/app.asar
  '';

  meta = with lib; {
    description = "Alephium desktop wallet";
    homepage = "https://github.com/alephium/alephium-wallet";
  };
}
