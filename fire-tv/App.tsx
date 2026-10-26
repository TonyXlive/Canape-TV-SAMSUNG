import React, { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, View, Text, Pressable } from 'react-native';
import { WebView } from '@amazon-devices/webview';
// @ts-ignore -- portable JavaScript module, covered by Node tests
import { createNetworkHandler } from './network';

export const App = () => {
  const web = useRef<any>(null);
  const [failed, setFailed] = useState(false);
  const network = useRef<any>(null);
  if (!network.current) {
    network.current = createNetworkHandler((reply: unknown) => {
      web.current?.injectJavaScript(`window.FireTVReply && window.FireTVReply(${JSON.stringify(reply)}); true;`);
    });
  }
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      web.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('firetvvisibility', {detail:${state === 'active'}})); true;`);
    });
    return () => { subscription.remove(); network.current.dispose(); };
  }, []);
  return <View style={{flex: 1, backgroundColor: '#101014'}}>
    {failed ? <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
      <Text style={{color: 'white', fontSize: 28}}>Canapé TV n’a pas pu démarrer.</Text>
      <Pressable hasTVPreferredFocus onPress={() => setFailed(false)}><Text style={{color: 'white', fontSize: 24}}>Réessayer</Text></Pressable>
      <Pressable onPress={() => BackHandler.exitApp()}><Text style={{color: 'white', fontSize: 24}}>Quitter</Text></Pressable>
    </View> : <WebView
      ref={web}
      style={{flex: 1}}
      hasTVPreferredFocus={true}
      source={{uri: 'file:///pkg/assets/canape/index.html'}}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      allowSystemKeyEvents={true}
      mediaPlaybackRequiresUserAction={false}
      allowsDefaultMediaControl={true}
      onShouldStartLoadWithRequest={(request: any) => request.url === 'file:///pkg/assets/canape/index.html'}
      onMessage={(event: any) => {
        const raw = event.nativeEvent.data;
        if (raw === '{"type":"exit"}') BackHandler.exitApp();
        else void network.current.receive(raw);
      }}
      onError={() => setFailed(true)}
    />}
  </View>;
};
export default App;
