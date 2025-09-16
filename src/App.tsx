import Layout from './components/Layout/Layout';
import InputPanel from './components/InputPanel/InputPanel';
import ViewerPanel from './components/ViewerPanel/ViewerPanel';
import './styles/App.css';

function App() {
  return (
    <Layout>
      <InputPanel />
      <ViewerPanel />
    </Layout>
  );
}

export default App;
