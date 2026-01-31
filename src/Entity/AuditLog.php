<?php
// src/Entity/AuditLog.php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ApiResource(
    operations: [
        new Get(security: "is_granted('ROLE_ADMIN')"),
        new GetCollection(security: "is_granted('ROLE_ADMIN')")
    ],
    order: ['occurredAt' => 'DESC']
)]
class AuditLog
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private ?string $action = null; // CREATE, UPDATE, DELETE

    #[ORM\Column(length: 255)]
    private ?string $entityClass = null; // Ex: App\Entity\Visit

    #[ORM\Column(nullable: true)]
    private ?string $entityId = null; // L'ID de l'objet manipulé

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $username = null; // Qui a fait l'action

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $changes = null; // Détail des changements (avant/après)

    #[ORM\Column]
    private ?\DateTimeImmutable $occurredAt = null;

    public function __construct()
    {
        $this->occurredAt = new \DateTimeImmutable();
    }

    // ... (Ajoutez uniquement les Getters, pas de Setters car c'est un log immuable)
    public function getId(): ?int { return $this->id; }
    public function getAction(): ?string { return $this->action; }
    public function getEntityClass(): ?string { return $this->entityClass; }
    public function getEntityId(): ?string { return $this->entityId; }
    public function getUsername(): ?string { return $this->username; }
    public function getChanges(): ?array { return $this->changes; }
    public function getOccurredAt(): ?\DateTimeImmutable { return $this->occurredAt; }

    // Setters pour le Subscriber uniquement
    public function setAction(string $action): self { $this->action = $action; return $this; }
    public function setEntityClass(string $entityClass): self { $this->entityClass = $entityClass; return $this; }
    public function setEntityId(?string $entityId): self { $this->entityId = $entityId; return $this; }
    public function setUsername(?string $username): self { $this->username = $username; return $this; }
    public function setChanges(?array $changes): self { $this->changes = $changes; return $this; }
}