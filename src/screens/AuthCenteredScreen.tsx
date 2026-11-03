/** Sign in — assembled from a validated screen spec (structure only, no styles). */
/**
 * Scaffold wiring (supplied by the generated app, not by the screen spec):
 *   - AuthMethods -> <AppAuthMethods />
 */
import { AuthCenteredLayout } from '@agiler/ui';
import { AppAuthMethods } from '../scaffold';

export function AuthCenteredScreen() {
  return (
    <AuthCenteredLayout>
      <AppAuthMethods />
    </AuthCenteredLayout>
  );
}
