import { inject } from "@angular/core";
import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpHeaderResponse, HttpInterceptorFn, HttpRequest } from "@angular/common/http";
import { catchError, filter, Observable, ObservableInput, retry, switchMap, take, throwError, timer } from "rxjs";
import { Router } from "@angular/router";
import { AuthService } from "@core/services/auth.service";
import { AUTH_FACADE, TokenStatus } from "../../auth/store/auth.models";
import { Store } from "@ngxs/store";
import { AuthSelectors } from "../../auth/store/auth.selectors";
import { RefreshToken } from "../../auth/store/auth.actions";
export const maxRetries = 2;
export const delayMs = 2000;

export const errorInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<any>> => {

  const router = inject(Router);
  const authService = inject(AuthService);
  const authFacade = inject(AUTH_FACADE);
  const store = inject(Store);
  let isRefreshing = false;

  return next(req).pipe(
    retry({ count: maxRetries, delay: (error) => shouldRetry(error) }),
    catchError((error) => {

      if (error instanceof HttpErrorResponse) {
        if (error.error instanceof ErrorEvent) {
          console.error(`Client-side error occurred : ${error.error.message}`);
        } else {
          if (error instanceof HttpErrorResponse &&
            !(req.url.includes('sign-in') || req.url.includes('refresh') || req.url.includes('logout')) &&
            error.status === 401) {
            if (!isRefreshing) {
              isRefreshing = true;
              if (store.select(AuthSelectors.isLoggedIn)) {
                store.dispatch(new RefreshToken());
                return store.select(AuthSelectors.auth).pipe(
                  filter(
                    auth =>
                      auth.refreshTokenStatus === TokenStatus.INVALID ||
                      (auth.refreshTokenStatus === TokenStatus.VALID && !!auth.user)
                  ),
                  take(1)
                  ,switchMap(() => {
                    isRefreshing = false;

                    return next(req);
                  }),
                  catchError((error) => {
                    isRefreshing = false;
                    if (error.status == '403') {
                      router.navigateByUrl("error/access-denied");
                    }

                    return throwError(() => error);
                  })
                );


              }

            }
          }
        }
      } else {
        console.error('An unexpected error has occurred!.');
      }
      throw error;
    })
  )
}

function shouldRetry(error: HttpHeaderResponse): ObservableInput<any> {
  if (error.status === 500) {
    return timer(delayMs);
  }
  return timer(0);
}

