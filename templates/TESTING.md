# TESTING.md

Convenciones de tests de este repo. Este archivo lo mantiene el desarrollador, no los nodos. Los nodos lo leen cuando una partichela les asigna escribir tests, y copian el ejemplo canónico.

## Qué es un test que vale

Un test vale si responde a un criterio de aceptación concreto (`AC-n`) y **falla cuando el comportamiento que cubre se rompe**. Un test que pasaría igual sin el cambio no está probando nada y se borra.

Un test no vale si:

- Testea la implementación en vez del comportamiento (espía el método que se está probando, asserta llamadas internas).
- Silencia errores para poder pasar (schemas permisivos, catch vacíos, `any` para esquivar tipos).
- No tiene `expect`, o su `expect` es trivial.
- Duplica un test existente con otro nombre.

## Reglas mecánicas

`sym check` rechaza el diff si aparece cualquiera de estos patrones. No se discuten en review: se corrigen.

- `NO_ERRORS_SCHEMA`, `CUSTOM_ELEMENTS_SCHEMA`
- `fit(`, `fdescribe(`, `xit(`, `xdescribe(`, `.only(`, `.skip(`
- `expect(true).toBe(true)`

Además, el evaluador verifica:

- Cada test nuevo lleva un comentario `// AC-n` con el criterio que cubre.
- Cada criterio de la partichela tiene al menos un test.
- No se modificaron ni relajaron asserts existentes. Si fue imprescindible, está justificado en la bitácora de la partichela.

## Ejemplo canónico

<!-- Reemplazá esto con UN test real de tu repo que consideres bien hecho. Los modelos copian ejemplos mucho mejor de lo que obedecen prohibiciones. -->

```ts
// AC-2: el login rechaza credenciales inválidas sin tocar el backend
describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['login']);
    await TestBed.configureTestingModule({
      imports: [LoginComponent],                 // standalone: se importa el componente real
      providers: [{ provide: AuthService, useValue: auth }],
    }).compileComponents();
    fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
  });

  it('no llama a AuthService.login si el formulario es inválido', () => {
    fixture.componentInstance.form.setValue({ email: 'no-es-un-mail', password: '' });
    fixture.componentInstance.submit();
    expect(auth.login).not.toHaveBeenCalled();
  });
});
```

## Angular, en particular

- Importá el componente o módulo real en el `TestBed`. Si el template usa un componente hijo que complica el test, importá el hijo también o reemplazalo por un stub **declarado explícitamente** con el mismo selector. Nunca lo escondas con un schema.
- Mockeá servicios, no componentes de tu propio territorio.
- Un test por comportamiento. El nombre del `it` describe el comportamiento, no el método.

## Cómo se corren

<!-- Comandos reales de este repo. Los nodos los usan en sus criterios. -->

- Subconjunto: `npx ng test --include='src/app/<carpeta>/**/*.spec.ts' --watch=false`
- Suite completa (solo el director): `npx ng test --watch=false`
