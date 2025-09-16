/**
 * WebSocket Connection Debug Script
 * Run this in browser console to diagnose Azure Speech Service WebSocket issues
 */

console.log('🔍 Azure Speech Service WebSocket Diagnostics');
console.log('='.repeat(50));

async function debugWebSocketConnection() {
  try {
    // 1. Check environment
    console.log('\n📋 Environment Check:');
    console.log(`  - Protocol: ${window.location.protocol}`);
    console.log(`  - Host: ${window.location.host}`);
    console.log(`  - WebSocket Support: ${typeof WebSocket !== 'undefined' ? '✅' : '❌'}`);
    console.log(`  - User Agent: ${navigator.userAgent.substring(0, 50)}...`);

    // 2. Check Azure configuration
    console.log('\n🔧 Azure Configuration:');
    const speechKey = import.meta.env?.VITE_AZURE_SPEECH_KEY || 'Not available in runtime';
    const speechRegion = import.meta.env?.VITE_AZURE_SPEECH_REGION || 'Not available in runtime';
    
    console.log(`  - Speech Key: ${speechKey ? speechKey.substring(0, 8) + '...' : 'NOT SET'}`);
    console.log(`  - Speech Region: ${speechRegion || 'NOT SET'}`);

    // 3. Test network connectivity
    console.log('\n🌐 Network Connectivity Test:');
    try {
      const testRegion = speechRegion || 'eastus2';
      const testUrl = `https://${testRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
      
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': 'test',
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      console.log(`  - HTTP Test: ${response.status === 401 ? '✅ Reachable' : `⚠️ Status ${response.status}`}`);
    } catch (error) {
      console.log(`  - HTTP Test: ❌ Failed - ${error.message}`);
    }

    // 4. Test WebSocket connection directly
    console.log('\n🔌 WebSocket Connection Test:');
    if (typeof WebSocket !== 'undefined') {
      const testRegion = speechRegion || 'eastus2';
      const testKey = speechKey || 'test-key';
      const wsUrl = `wss://${testRegion}.stt.speech.microsoft.com/stt/speech/universal/v2?language=en-US&format=simple&Ocp-Apim-Subscription-Key=${testKey}`;
      
      console.log(`  - Attempting connection to: ${wsUrl.substring(0, 80)}...`);
      
      const ws = new WebSocket(wsUrl);
      
      const testPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => {
          ws.close();
          resolve('⏰ Timeout (10s)');
        }, 10000);

        ws.onopen = () => {
          clearTimeout(timeout);
          ws.close();
          resolve('✅ Connection successful');
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          resolve(`❌ Connection failed: ${error.type || 'Unknown error'}`);
        };

        ws.onclose = (event) => {
          clearTimeout(timeout);
          resolve(`🔌 Connection closed: Code ${event.code}, Reason: ${event.reason || 'No reason'}`);
        };
      });

      const result = await testPromise;
      console.log(`  - WebSocket Test: ${result}`);
    } else {
      console.log('  - WebSocket Test: ❌ WebSocket not supported');
    }

    // 5. Test Speech Service if available
    console.log('\n🎯 Speech Service Test:');
    if (window.speechService && typeof window.speechService.runDiagnostics === 'function') {
      try {
        const diagnostics = await window.speechService.runDiagnostics();
        console.log('  - Configuration:', diagnostics.configuration ? '✅' : '❌');
        console.log('  - Network:', diagnostics.networkConnectivity ? '✅' : '❌');
        console.log('  - WebSocket Support:', diagnostics.webSocketSupport ? '✅' : '❌');
        
        if (diagnostics.suggestions.length > 0) {
          console.log('  - Suggestions:');
          diagnostics.suggestions.forEach(suggestion => {
            console.log(`    • ${suggestion}`);
          });
        }
      } catch (error) {
        console.log(`  - Speech Service Test: ❌ Failed - ${error.message}`);
      }
    } else {
      console.log('  - Speech Service: ⚠️ Not available (service not initialized)');
    }

    // 6. Recommendations
    console.log('\n💡 Troubleshooting Recommendations:');
    console.log('  1. Ensure you are using HTTPS (not HTTP)');
    console.log('  2. Check firewall and proxy settings');
    console.log('  3. Verify Azure Speech Service key and region');
    console.log('  4. Test from different network if possible');
    console.log('  5. Check Azure service status at https://status.azure.com');
    console.log('  6. Try disabling browser extensions temporarily');
    console.log('  7. Clear browser cache and reload the page');

  } catch (error) {
    console.error('❌ Diagnostic script failed:', error);
  }
}

// Run diagnostics
debugWebSocketConnection();

// Export for manual testing
window.debugWebSocketConnection = debugWebSocketConnection;

console.log('\n🔄 To run diagnostics again, call: debugWebSocketConnection()');
