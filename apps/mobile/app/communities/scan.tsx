import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Screen } from '@/components/ui';
import { codeFromQr } from '@/lib/qr';
import { colors, radius } from '@/lib/theme';

/** Scan a community's QR code to join (PRD §8 "Display QR"). */
export default function ScanCommunityQr() {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  if (!permission) return <Screen><Body>Checking camera permission…</Body></Screen>;
  if (!permission.granted)
    return (
      <Screen>
        <Body>EMCOM needs the camera to scan your community&apos;s QR code. You can also type the code instead.</Body>
        {permission.canAskAgain ? (
          <Button title="ALLOW CAMERA" onPress={() => void requestPermission()} />
        ) : (
          <Button title="OPEN SETTINGS" variant="outline" icon="settings-outline" onPress={() => void Linking.openSettings()} />
        )}
        <Button title="Type the code instead" variant="ghost" onPress={() => router.replace('/communities/join')} />
      </Screen>
    );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (handled.current) return;
          const code = codeFromQr(data);
          if (!code) {
            setError('That QR code is not an EMCOM community code.');
            return;
          }
          handled.current = true;
          router.replace({ pathname: '/communities/join', params: { code } });
        }}
      />
      <View style={{ position: 'absolute', bottom: 40, left: 20, right: 20, gap: 12 }}>
        <View style={{ backgroundColor: '#000000aa', borderRadius: radius.md, padding: 14 }}>
          <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', fontWeight: '700' }}>Point the camera at the community QR code</Text>
          {error ? <Text accessibilityRole="alert" style={{ color: colors.cautionSoft, textAlign: 'center', marginTop: 6 }}>{error}</Text> : null}
        </View>
        <Button title="Type the code instead" variant="outline" onPress={() => router.replace('/communities/join')} />
      </View>
    </View>
  );
}
