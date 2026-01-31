<?php
// src/Entity/Ticket.php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Post;
use ApiPlatform\Metadata\Patch;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;

#[ORM\Entity]
#[ApiResource(
    operations: [
        new Get(),           // Admin: Voir un ticket
        new GetCollection(), // Admin: Lister les tickets
        new Post(),          // App: Créer un ticket
        new Patch()          // Admin: Changer le statut (Résolu/Rejeté)
    ],
    normalizationContext: ['groups' => ['ticket:read']],
    denormalizationContext: ['groups' => ['ticket:write']]
)]
class Ticket
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    #[Groups(['ticket:read'])]
    private ?int $id = null;

    // Catégorie flexible : WEIGHT_ANOMALY, MORTALITY_ALERT, EQUIPMENT_FAILURE, SUPPLY_SHORTAGE...
    #[ORM\Column(length: 50)]
    #[Groups(['ticket:read', 'ticket:write'])]
    private ?string $category = null;

    // Priorité : LOW, MEDIUM, HIGH, CRITICAL
    #[ORM\Column(length: 20)]
    #[Groups(['ticket:read', 'ticket:write'])]
    private ?string $priority = 'MEDIUM';

    // Statut : OPEN, IN_PROGRESS, RESOLVED, CLOSED
    #[ORM\Column(length: 20)]
    #[Groups(['ticket:read', 'ticket:write'])]
    private ?string $status = 'OPEN';

    #[ORM\Column(type: 'text')]
    #[Groups(['ticket:read', 'ticket:write'])]
    private ?string $description = null; // La justification ou le problème

    // JSON pour stocker les métadonnées variables (ex: poids avant/après, ID machine en panne, etc.)
    #[ORM\Column(nullable: true)]
    #[Groups(['ticket:read', 'ticket:write'])]
    private ?array $details = []; 

    // Relation nullable : Un ticket peut être lié à une bande, ou être général
    #[ORM\ManyToOne]
    #[Groups(['ticket:read', 'ticket:write'])]
    private ?Flock $flock = null;

    // Relation nullable : Un ticket peut être lié à une visite
    #[ORM\ManyToOne]
    #[Groups(['ticket:read', 'ticket:write'])]
    private ?Visit $visit = null;

    #[ORM\Column]
    #[Groups(['ticket:read'])]
    private ?\DateTimeImmutable $createdAt = null;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    // --- GETTERS & SETTERS ---

    public function getId(): ?int { return $this->id; }

    public function getCategory(): ?string { return $this->category; }
    public function setCategory(string $category): self { $this->category = $category; return $this; }

    public function getPriority(): ?string { return $this->priority; }
    public function setPriority(string $priority): self { $this->priority = $priority; return $this; }

    public function getStatus(): ?string { return $this->status; }
    public function setStatus(string $status): self { $this->status = $status; return $this; }

    public function getDescription(): ?string { return $this->description; }
    public function setDescription(string $description): self { $this->description = $description; return $this; }

    public function getDetails(): ?array { return $this->details; }
    public function setDetails(?array $details): self { $this->details = $details; return $this; }

    public function getFlock(): ?Flock { return $this->flock; }
    public function setFlock(?Flock $flock): self { $this->flock = $flock; return $this; }

    public function getVisit(): ?Visit { return $this->visit; }
    public function setVisit(?Visit $visit): self { $this->visit = $visit; return $this; }

    public function getCreatedAt(): ?\DateTimeImmutable { return $this->createdAt; }
}