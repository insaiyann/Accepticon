import React, { useState, useEffect } from 'react';
import './ConfigurationPanel.css';

interface AzureCredentials {
  speechKey: string;
  speechRegion: string;
  openaiKey: string;
  openaiEndpoint: string;
  openaiDeployment: string;
}

interface ConfigurationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (credentials: AzureCredentials) => void;
}

const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({
  isOpen,
  onClose,
  onSave
}) => {
  const [credentials, setCredentials] = useState<AzureCredentials>({
    speechKey: '',
    speechRegion: '',
    openaiKey: '',
    openaiEndpoint: '',
    openaiDeployment: ''
  });

  const [showCredentials, setShowCredentials] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load credentials from environment variables on mount
  useEffect(() => {
    if (isOpen) {
      setCredentials({
        speechKey: import.meta.env.VITE_AZURE_SPEECH_KEY || '',
        speechRegion: import.meta.env.VITE_AZURE_SPEECH_REGION || '',
        openaiKey: import.meta.env.VITE_AZURE_OPENAI_KEY || '',
        openaiEndpoint: import.meta.env.VITE_AZURE_OPENAI_ENDPOINT || '',
        openaiDeployment: import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT || ''
      });
    }
  }, [isOpen]);

  const handleChange = (field: keyof AzureCredentials, value: string) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    // Validate required fields
    const requiredFields: Array<{ key: keyof AzureCredentials; label: string }> = [
      { key: 'speechKey', label: 'Speech API Key' },
      { key: 'speechRegion', label: 'Speech Region' },
      { key: 'openaiKey', label: 'OpenAI API Key' },
      { key: 'openaiEndpoint', label: 'OpenAI Endpoint' },
      { key: 'openaiDeployment', label: 'OpenAI Deployment' }
    ];

    const missingFields = requiredFields.filter(field => !credentials[field.key].trim());
    
    if (missingFields.length > 0) {
      alert(`Please fill in the following required fields:\n${missingFields.map(f => f.label).join('\n')}`);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(credentials);
      onClose();
    } catch (error) {
      console.error('Failed to save credentials:', error);
      alert('Failed to save credentials. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setCredentials({
      speechKey: '',
      speechRegion: '',
      openaiKey: '',
      openaiEndpoint: '',
      openaiDeployment: ''
    });
  };

  const isFormValid = Object.values(credentials).every(value => value.trim().length > 0);

  if (!isOpen) return null;

  return (
    <div className="config-overlay">
      <div className="config-panel">
        <div className="config-header">
          <h2>Azure Configuration</h2>
          <button className="config-close" onClick={onClose}>×</button>
        </div>

        <div className="config-content">
          <div className="config-section">
            <h3>📢 Azure Speech Service</h3>
            <p className="config-description">
              Configure your Azure Speech Service credentials for speech-to-text functionality.
            </p>
            
            <div className="config-field">
              <label htmlFor="speechKey">API Key *</label>
              <input
                id="speechKey"
                type={showCredentials ? 'text' : 'password'}
                value={credentials.speechKey}
                onChange={(e) => handleChange('speechKey', e.target.value)}
                placeholder="Enter your Azure Speech API key"
              />
            </div>

            <div className="config-field">
              <label htmlFor="speechRegion">Region *</label>
              <select
                id="speechRegion"
                value={credentials.speechRegion}
                onChange={(e) => handleChange('speechRegion', e.target.value)}
              >
                <option value="">Select region</option>
                <option value="eastus">East US</option>
                <option value="westus">West US</option>
                <option value="westus2">West US 2</option>
                <option value="eastus2">East US 2</option>
                <option value="centralus">Central US</option>
                <option value="northcentralus">North Central US</option>
                <option value="southcentralus">South Central US</option>
                <option value="westcentralus">West Central US</option>
                <option value="northeurope">North Europe</option>
                <option value="westeurope">West Europe</option>
                <option value="francecentral">France Central</option>
                <option value="uksouth">UK South</option>
                <option value="southeastasia">Southeast Asia</option>
                <option value="eastasia">East Asia</option>
                <option value="australiaeast">Australia East</option>
                <option value="japaneast">Japan East</option>
                <option value="koreacentral">Korea Central</option>
                <option value="southafricanorth">South Africa North</option>
                <option value="brazilsouth">Brazil South</option>
                <option value="canadacentral">Canada Central</option>
                <option value="centralindia">Central India</option>
              </select>
            </div>
          </div>

          <div className="config-section">
            <h3>🤖 Azure OpenAI Service</h3>
            <p className="config-description">
              Configure your Azure OpenAI credentials for diagram generation.
            </p>
            
            <div className="config-field">
              <label htmlFor="openaiKey">API Key *</label>
              <input
                id="openaiKey"
                type={showCredentials ? 'text' : 'password'}
                value={credentials.openaiKey}
                onChange={(e) => handleChange('openaiKey', e.target.value)}
                placeholder="Enter your Azure OpenAI API key"
              />
            </div>

            <div className="config-field">
              <label htmlFor="openaiEndpoint">Endpoint *</label>
              <input
                id="openaiEndpoint"
                type="url"
                value={credentials.openaiEndpoint}
                onChange={(e) => handleChange('openaiEndpoint', e.target.value)}
                placeholder="https://your-resource.openai.azure.com"
              />
            </div>

            <div className="config-field">
              <label htmlFor="openaiDeployment">Deployment Name *</label>
              <input
                id="openaiDeployment"
                type="text"
                value={credentials.openaiDeployment}
                onChange={(e) => handleChange('openaiDeployment', e.target.value)}
                placeholder="gpt-5-chat"
              />
            </div>
          </div>

          <div className="config-controls">
            <label className="show-credentials">
              <input
                type="checkbox"
                checked={showCredentials}
                onChange={(e) => setShowCredentials(e.target.checked)}
              />
              Show credentials
            </label>
          </div>
        </div>

        <div className="config-footer">
          <div className="config-info">
            <p>
              <strong>💡 Environment Variables:</strong> You can also set these credentials using environment variables:
            </p>
            <ul>
              <li><code>VITE_AZURE_SPEECH_KEY</code></li>
              <li><code>VITE_AZURE_SPEECH_REGION</code></li>
              <li><code>VITE_AZURE_OPENAI_KEY</code></li>
              <li><code>VITE_AZURE_OPENAI_ENDPOINT</code></li>
              <li><code>VITE_AZURE_OPENAI_DEPLOYMENT</code></li>
            </ul>
          </div>

          <div className="config-actions">
            <button
              className="btn btn-secondary"
              onClick={handleReset}
              disabled={isSaving}
            >
              Reset
            </button>
            <button
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!isFormValid || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save & Initialize'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigurationPanel;
