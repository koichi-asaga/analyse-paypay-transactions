import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { loadConfig, setAuthEnabled } from './config.ts';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

loadConfig()
  .then((config) => {
    setAuthEnabled(config.auth === 'cognito');
    root.render(
      <StrictMode>
        {config.auth === 'cognito' ? (
          <div className="auth-shell">
            <Authenticator hideSignUp={!config.allowSelfSignUp} loginMechanisms={['email']}>
              {({ signOut, user }) => <App userLabel={user?.signInDetails?.loginId} onSignOut={signOut} />}
            </Authenticator>
          </div>
        ) : (
          <App userLabel="ローカル開発（認証なし）" />
        )}
      </StrictMode>,
    );
  })
  .catch((e: Error) => root.render(<p className="error">{e.message}</p>));
