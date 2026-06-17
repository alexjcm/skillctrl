# Templates for `writing-junit-tests`

Use these templates as starting points and adapt names/imports to the repository conventions.

## 1) Service Unit Test (JUnit 4 + Mockito)

```java
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;

@RunWith(MockitoJUnitRunner.class)
public class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @InjectMocks
    private OrderService service;

    @Test
    public void shouldReturnOrderWhenIdExists() {
        // Arrange
        Order expected = new Order(1L);
        when(orderRepository.findById(1L)).thenReturn(expected);

        // Act
        Order result = service.findById(1L);

        // Assert
        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo(1L);
    }
}
```

## 2) Controller Unit Test (No Spring Test Context)

```java
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;

@RunWith(MockitoJUnitRunner.class)
public class UserControllerTest {

    @Mock
    private UserService userService;

    @InjectMocks
    private UserController controller;

    @Test
    public void shouldReturnOkResponseWhenUserExists() {
        // Arrange
        UserDTO dto = new UserDTO("john");
        when(userService.getUser("john")).thenReturn(dto);

        // Act
        Response response = controller.getUser("john");

        // Assert
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getBody()).isEqualTo(dto);
    }
}
```

## 3) Repository Integration Test (JPA Slice)

This is integration testing, not unit testing.

```java
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.junit4.SpringRunner;

@RunWith(SpringRunner.class)
@DataJpaTest
public class ReturnProviderRepositoryTest {

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private ReturnProviderRepository repository;

    @Before
    public void setup() {
        entityManager.persist(new ReturnProviderEntity(100L, 1, 5001L, "OLD", "USR"));
    }

    @Test
    public void shouldUpdateSapReturnNumberWhenCompanyAndProcessMatch() {
        // Act
        long updatedRows = repository.updateSapReturnNumber(1, 5001L, "4500001234", "FRM0");
        entityManager.flush();
        entityManager.clear();

        // Assert
        ReturnProviderEntity entity = entityManager.find(ReturnProviderEntity.class, 100L);
        assertThat(updatedRows).isEqualTo(1L);
        assertThat(entity)
            .extracting(ReturnProviderEntity::getSapReturnNumber, ReturnProviderEntity::getModifierUser)
            .containsExactly("4500001234", "FRM0");
    }
}
```

## 4) Controller Integration Test (Web MVC Slice)

```java
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;

@RunWith(SpringRunner.class)
@WebMvcTest(UserController.class)
public class UserControllerWebMvcTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    @Test
    public void shouldReturnUserWhenRequestIsValid() throws Exception {
        mockMvc.perform(get("/users/john"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("john"));
    }
}
```
