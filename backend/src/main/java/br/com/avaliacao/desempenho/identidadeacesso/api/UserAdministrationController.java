package br.com.avaliacao.desempenho.identidadeacesso.api;

import br.com.avaliacao.desempenho.identidadeacesso.application.UserAdministrationRepository;
import br.com.avaliacao.desempenho.identidadeacesso.application.UserAdministrationService;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AccountStatus;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.PermissionEffect;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Administração local de contas e concessões explícitas, sem expor segredos ao navegador. */
@RestController
@RequestMapping("/api/v1/administration/users")
@ConditionalOnSqlServerPersistence
public class UserAdministrationController {

  private final UserAdministrationService service;

  public UserAdministrationController(UserAdministrationService service) {
    this.service = service;
  }

  @GetMapping
  public List<UserResponse> list(Authentication authentication) {
    var actor = principal(authentication);
    return service.listUsers(actor.userId(), actor.user().permissions()).stream()
        .map(UserResponse::from)
        .toList();
  }

  @GetMapping("/{userId}")
  public UserResponse get(@PathVariable UUID userId, Authentication authentication) {
    var actor = principal(authentication);
    return UserResponse.from(service.getUser(userId, actor.userId(), actor.user().permissions()));
  }

  @PostMapping
  public ResponseEntity<UserResponse> create(
      @Valid @RequestBody CreateUserRequest request,
      Authentication authentication,
      HttpServletRequest servletRequest) {
    AuthenticatedPrincipal authenticated = principal(authentication);
    UserAdministrationRepository.UserView created =
        service.createUser(
            request.login(),
            request.displayName(),
            request.initialPassword(),
            request.initialRoles() == null ? Set.of() : request.initialRoles(),
            authenticated.userId(),
            authenticated.user().roleCodes(),
            authenticated.user().permissions(),
            RequestCorrelationFilter.getRequestId(servletRequest));
    return ResponseEntity.status(HttpStatus.CREATED)
        .header(HttpHeaders.LOCATION, "/api/v1/administration/users/" + created.id())
        .body(UserResponse.from(created));
  }

  @PatchMapping("/{userId}")
  public UserResponse update(
      @PathVariable UUID userId,
      @Valid @RequestBody UpdateUserRequest request,
      Authentication authentication,
      HttpServletRequest servletRequest) {
    return UserResponse.from(
        service.updateUser(
            userId,
            request.displayName(),
            request.status(),
            principal(authentication).userId(),
            RequestCorrelationFilter.getRequestId(servletRequest)));
  }

  @PatchMapping("/{userId}/logical-deletion")
  public UserResponse logicallyDelete(
      @PathVariable UUID userId,
      @Valid @RequestBody LogicalDeletionRequest request,
      Authentication authentication,
      HttpServletRequest servletRequest) {
    return UserResponse.from(
        service.logicallyDeleteUser(
            userId,
            request.deleted(),
            principal(authentication).userId(),
            RequestCorrelationFilter.getRequestId(servletRequest)));
  }

  @PutMapping("/{userId}/password-reset")
  public UserResponse resetPassword(
      @PathVariable UUID userId,
      @Valid @RequestBody PasswordResetRequest request,
      Authentication authentication,
      HttpServletRequest servletRequest) {
    AuthenticatedPrincipal authenticated = principal(authentication);
    return UserResponse.from(
        service.resetOrdinaryUserPassword(
            userId,
            request.temporaryPassword(),
            authenticated.userId(),
            authenticated.user().permissions(),
            RequestCorrelationFilter.getRequestId(servletRequest)));
  }

  @PutMapping("/{userId}/password-reset-delegation")
  public UserResponse replacePasswordResetDelegation(
      @PathVariable UUID userId,
      @Valid @RequestBody PasswordResetDelegationRequest request,
      Authentication authentication,
      HttpServletRequest servletRequest) {
    AuthenticatedPrincipal authenticated = principal(authentication);
    return UserResponse.from(
        service.replacePasswordResetDelegation(
            userId,
            request.canResetPassword(),
            request.canDelegatePasswordReset(),
            authenticated.userId(),
            authenticated.user().permissions(),
            RequestCorrelationFilter.getRequestId(servletRequest)));
  }

  @PutMapping("/{userId}/access-grants")
  public UserResponse replaceAccess(
      @PathVariable UUID userId,
      @Valid @RequestBody ReplaceAccessRequest request,
      Authentication authentication,
      HttpServletRequest servletRequest) {
    AuthenticatedPrincipal authenticated = principal(authentication);
    List<UserAdministrationRepository.IndividualPermission> permissions =
        request.permissions().stream()
            .map(
                item ->
                    new UserAdministrationRepository.IndividualPermission(
                        item.code(), item.effect()))
            .toList();
    return UserResponse.from(
        service.replaceAccess(
            userId,
            request.roles(),
            permissions,
            authenticated.userId(),
            authenticated.user().roleCodes(),
            authenticated.user().permissions(),
            RequestCorrelationFilter.getRequestId(servletRequest)));
  }

  private static AuthenticatedPrincipal principal(Authentication authentication) {
    if (authentication == null
        || !(authentication.getPrincipal() instanceof AuthenticatedPrincipal principal)) {
      throw new IllegalStateException("Authenticated principal was not resolved.");
    }
    return principal;
  }

  public record CreateUserRequest(
      @NotBlank @Size(max = 128) String login,
      @NotBlank @Size(max = 200) String displayName,
      @NotBlank @Size(min = 12, max = 200) String initialPassword,
      Set<@Pattern(regexp = "[A-Z0-9_.]{1,150}") String> initialRoles) {
    @com.fasterxml.jackson.annotation.JsonAnySetter
    public void rejectUnknown(String field, Object value) {
      throw new IllegalArgumentException("Campo não permitido.");
    }

    @Override
    public String toString() {
      return "CreateUserRequest[redacted]";
    }
  }

  public record UpdateUserRequest(
      @NotBlank @Size(max = 200) String displayName, @NotNull AccountStatus status) {
    @com.fasterxml.jackson.annotation.JsonAnySetter
    public void rejectUnknown(String field, Object value) {
      throw new IllegalArgumentException("Campo não permitido.");
    }

    @Override
    public String toString() {
      return "UpdateUserRequest[redacted]";
    }
  }

  public record LogicalDeletionRequest(@jakarta.validation.constraints.AssertTrue boolean deleted) {
    @com.fasterxml.jackson.annotation.JsonAnySetter
    public void rejectUnknown(String field, Object value) {
      throw new IllegalArgumentException("Campo não permitido.");
    }

    @Override
    public String toString() {
      return "LogicalDeletionRequest[redacted]";
    }
  }

  public record PasswordResetRequest(
      @NotBlank @Size(min = 12, max = 200) String temporaryPassword) {
    @com.fasterxml.jackson.annotation.JsonAnySetter
    public void rejectUnknown(String field, Object value) {
      throw new IllegalArgumentException("Campo não permitido.");
    }

    @Override
    public String toString() {
      return "PasswordResetRequest[redacted]";
    }
  }

  public record PasswordResetDelegationRequest(
      @NotNull Boolean canResetPassword, @NotNull Boolean canDelegatePasswordReset) {
    @jakarta.validation.constraints.AssertTrue(
        message = "A capacidade de delegar exige a capacidade de redefinir senha.")
    public boolean isConsistent() {
      return !Boolean.TRUE.equals(canDelegatePasswordReset)
          || Boolean.TRUE.equals(canResetPassword);
    }

    @com.fasterxml.jackson.annotation.JsonAnySetter
    public void rejectUnknown(String field, Object value) {
      throw new IllegalArgumentException("Campo não permitido na delegação de senha.");
    }
  }

  public record ReplaceAccessRequest(
      @NotNull Set<@Pattern(regexp = "[A-Z0-9_.]{1,150}") String> roles,
      @NotNull List<@Valid PermissionGrantRequest> permissions) {
    @com.fasterxml.jackson.annotation.JsonAnySetter
    public void rejectUnknown(String field, Object value) {
      throw new IllegalArgumentException("Campo não permitido.");
    }

    @Override
    public String toString() {
      return "ReplaceAccessRequest[redacted]";
    }
  }

  public record PermissionGrantRequest(
      @NotBlank @Pattern(regexp = "[A-Z0-9_.]{1,150}") String code,
      @NotNull PermissionEffect effect) {
    @com.fasterxml.jackson.annotation.JsonAnySetter
    public void rejectUnknown(String field, Object value) {
      throw new IllegalArgumentException("Campo não permitido.");
    }

    @Override
    public String toString() {
      return "PermissionGrantRequest[redacted]";
    }
  }

  public record UserResponse(
      String id,
      String login,
      String displayName,
      AccountStatus status,
      boolean protectedFromNormalFlow,
      boolean logicallyDeleted,
      boolean passwordChangeRequired,
      Set<String> roles,
      List<PermissionGrantResponse> individualPermissions,
      java.time.Instant updatedAt) {
    static UserResponse from(UserAdministrationRepository.UserView source) {
      return new UserResponse(
          source.id().toString(),
          source.login(),
          source.displayName(),
          source.status(),
          source.protectedFromNormalFlow(),
          source.logicallyDeleted(),
          source.passwordChangeRequired(),
          source.roles(),
          source.individualPermissions().stream().map(PermissionGrantResponse::from).toList(),
          source.updatedAt());
    }
  }

  public record PermissionGrantResponse(String code, PermissionEffect effect) {
    static PermissionGrantResponse from(UserAdministrationRepository.IndividualPermission source) {
      return new PermissionGrantResponse(source.permissionCode(), source.effect());
    }
  }
}
