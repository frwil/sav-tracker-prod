<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use Symfony\Component\Serializer\Attribute\Groups;

#[ORM\Entity]
#[ApiResource(
    operations: [new Get()],
    normalizationContext: ['groups' => ['photo:read']]
)]
class ObservationPhoto
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    #[Groups(['observation:read', 'photo:read'])]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    #[Groups(['observation:read', 'photo:read'])]
    public ?string $contentUrl = null;

    #[ORM\ManyToOne(inversedBy: 'photos')]
    #[ORM\JoinColumn(nullable: false)]
    private ?Observation $observation = null;

    public function getId(): ?int { return $this->id; }

    public function getObservation(): ?Observation { return $this->observation; }
    public function setObservation(?Observation $observation): self {
        $this->observation = $observation;
        return $this;
    }
}