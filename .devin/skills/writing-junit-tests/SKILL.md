---
name: writing-junit-tests
description: Generates JUnit 4 tests for Java 8 and defaults to unit tests unless the user explicitly requests integration tests. Use when the user asks to write Java tests, unit tests, integration tests, or test classes.
---

# Writing JUnit Tests

This skill generates Java 8 tests using JUnit 4, with deterministic selection between unit and integration styles.

## Activation Signals

Use this skill when the user asks to:
- write tests for Java code
- create unit tests
- create integration tests
- generate test classes for service/controller/repository code

## Out of Scope

- JUnit 5 migration
- non-Java or non-JUnit requests
- test frameworks outside JUnit 4 context

## Decision Policy (Mandatory)

1. If user does not specify test type, generate **unit tests**.
2. Generate integration tests only when user explicitly asks for integration behavior.
3. Do not infer integration only because the class is a `Controller` or `Repository`.
4. `@RunWith(SpringRunner.class)` + `@DataJpaTest` is an **integration test**, not a unit test.

## Core Rules

- Target stack: Java 8 + JUnit 4.
- Follow repository conventions first when they conflict with skill defaults.
- Prefer AssertJ style when compatible with repository conventions.
- Use static imports for assertions and Mockito helpers where possible.
- Avoid JUnit 5 annotations (`@ExtendWith`, `@BeforeEach`, `@AfterEach`).
- Keep naming explicit and behavior-oriented (`should...When...` or `given...When...Then`).
- Do not add unnecessary tests for trivial getters/setters unless requested.

## Unit Test Guidance

Use for isolated logic, no Spring context.

Recommended annotations and structure:
- `@RunWith(MockitoJUnitRunner.class)`
- `@Mock`, `@InjectMocks`, `@Before`, `@Test`
- AAA flow: Arrange, Act, Assert

Unit constraints:
- Do not use `@DataJpaTest`, `@WebMvcTest`, or `@SpringBootTest`.
- Prefer mocking collaborators and asserting behavior/output.

## Integration Test Guidance

Use only when explicitly requested by the user.

Choose the narrowest scope:
- Repository integration: `@RunWith(SpringRunner.class)` + `@DataJpaTest`
- Controller integration: `@RunWith(SpringRunner.class)` + `@WebMvcTest`
- Full context: `@RunWith(SpringRunner.class)` + `@SpringBootTest` only when needed

Integration expectations:
- Use real Spring slice/context components as appropriate.
- Verify observable behavior at boundary level (HTTP, JPA interaction, transactional effects).

## Assertions Policy

- Default preference: AssertJ.
- If project convention or dependencies use another assertion style, follow the repository.
- Prefer chained assertions on the same subject and `extracting(...).containsExactly(...)` patterns when they improve readability.

Detailed assertion examples: [`references/assertions.md`](references/assertions.md)

## Templates

Use templates from:
- [`references/templates.md`](references/templates.md)

Template set includes:
- Service unit test (Mockito runner).
- Controller unit test (no Spring test context).
- Repository integration test (`@DataJpaTest`).
- Controller integration test (`@WebMvcTest`).

## Final Verification Checklist

- Confirm requested test type (unit vs integration) before generating code.
- Confirm Java 8 + JUnit 4 annotations/imports.
- Confirm no Spring context annotations appear in unit tests.
- Confirm integration tests use the correct Spring slice for the request.
- Confirm assertion style follows repository conventions.
- Confirm target tests compile and the requested test class/method can be executed.
