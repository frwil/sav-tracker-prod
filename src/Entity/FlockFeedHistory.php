<?php
// src/Entity/FlockFeedHistory.php

namespace App\Entity;

use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\Post;
use Doctrine\ORM\Mapping as ORM;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\GetCollection;
use Symfony\Component\Serializer\Attribute\Groups;

#[ORM\Entity]
#[ApiResource(
    operations: [
        new Get(),
        new GetCollection(),
        new Post()
    ],
    normalizationContext: ['groups' => ['feed_history:read']],
    denormalizationContext: ['groups' => ['feed_history:write']]
)]
#[ORM\HasLifecycleCallbacks]
class FlockFeedHistory
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    #[Groups(['feed_history:read', 'flock:read','observation:read','observation:write'])]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'feedHistory')]
    #[ORM\JoinColumn(nullable: false)]
    #[Groups(['feed_history:read', 'flock:read','observation:read','feed_history:write'])]
    private ?Flock $flock = null;

    // Lien vers l'observation qui a déclenché ce changement
    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')] 
    #[Groups(['feed_history:read', 'flock:read','observation:read','feed_history:write'])]
    private ?Observation $observation = null;

    #[ORM\Column(length: 50,nullable: true)]
    #[Groups(['feed_history:read', 'flock:read','observation:read','feed_history:write'])]
    private ?string $previousStrategy = null;

    #[ORM\Column(length: 50)]
    #[Groups(['feed_history:read', 'flock:read','observation:read','feed_history:write'])]
    private ?string $newStrategy = null;

    #[ORM\Column(length: 50, nullable: true)]
    #[Groups(['feed_history:read', 'flock:read','observation:read','feed_history:write'])]
    private ?string $previousFormula = null;

    #[ORM\Column(length: 50, nullable: true)]
    #[Groups(['feed_history:read', 'flock:read','observation:read','feed_history:write'])]
    private ?string $newFormula = null;

    #[ORM\Column(type: 'datetime_immutable')]
    #[Groups(['feed_history:read', 'flock:read', 'visit:read'])]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(type: 'datetime_immutable')]
    #[Groups(['feed_history:read', 'flock:read', 'visit:read'])]
    private ?\DateTimeImmutable $changedAt = null;

    public function __construct()
    {
        $this->changedAt = new \DateTimeImmutable();
    }

    #[ORM\PrePersist]
    public function setCreatedAtValue(): void
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    // --- Getters & Setters ---

    public function getId(): ?int { return $this->id; }

    public function getFlock(): ?Flock { return $this->flock; }
    public function setFlock(?Flock $flock): self { $this->flock = $flock; return $this; }

    public function getObservation(): ?Observation { return $this->observation; }
    public function setObservation(?Observation $observation): self { $this->observation = $observation; return $this; }

    public function getPreviousStrategy(): ?string { return $this->previousStrategy; }
    public function setPreviousStrategy(?string $previousStrategy): self { $this->previousStrategy = $previousStrategy; return $this; }

    public function getNewStrategy(): ?string { return $this->newStrategy; }
    public function setNewStrategy(string $newStrategy): self { $this->newStrategy = $newStrategy; return $this; }

    public function getPreviousFormula(): ?string { return $this->previousFormula; }
    public function setPreviousFormula(?string $previousFormula): self { $this->previousFormula = $previousFormula; return $this; }

    public function getNewFormula(): ?string { return $this->newFormula; }
    public function setNewFormula(?string $newFormula): self { $this->newFormula = $newFormula; return $this; }

    public function getCreatedAt(): ?\DateTimeImmutable { return $this->createdAt; }
    public function setCreatedAt(\DateTimeImmutable $createdAt): self { $this->createdAt = $createdAt; return $this; }

    public function getChangedAt(): ?\DateTimeImmutable { return $this->changedAt; }
}